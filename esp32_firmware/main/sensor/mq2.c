#include "mq2.h"
#include "esp_log.h"
#include "esp_adc/adc_oneshot.h"
#include "hal/adc_types.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "nvs_flash.h"
#include "nvs.h"
#include <string.h>
#include <stdbool.h>

#include "sensor/adc_manager.h"

#ifndef ADC_ATTEN_DB_11
#define ADC_ATTEN_DB_11 3
#endif

static const char *TAG = "mq2";

#define MQ2_ADC_CHANNEL       ADC_CHANNEL_6   // 对应 GPIO7（用户指定）
#define MQ2_ADC_WIDTH         ADC_BITWIDTH_12
#define MQ2_ADC_ATTEN         ADC_ATTEN_DB_11

#define MQ2_DO_GPIO           GPIO_NUM_7      // DO -> GPIO7
#define MQ2_DO_INTR_FLAGS     0

#define MQ2_SAMPLE_INTERVAL_MS    1000
#define MQ2_MOVING_WINDOW         5
#define MQ2_NVS_NAMESPACE         "mq2"

static adc_oneshot_unit_handle_t adc_handle = NULL;

static int adc_window[MQ2_MOVING_WINDOW];
static int window_idx = 0;
static bool window_full = false;

static volatile bool do_alarm_flag = false;
static uint32_t last_alarm_ts = 0;
static int alarm_report_interval_s = 30; // 限流：30s 内只上报一次相同告警

// 校准参数（默认未标定）
static float calib_slope = 1.0f;
static float calib_offset = 0.0f;
static int saved_thresh_raw = 2000; // 默认阈值，可由 NVS 覆盖

static QueueHandle_t mq2_evt_queue = NULL;

typedef struct {
    uint32_t ts;
    bool level;
} mq2_do_evt_t;

static void IRAM_ATTR mq2_do_isr(void* arg)
{
    mq2_do_evt_t evt = { .ts = (uint32_t)(esp_log_timestamp()/1000), .level = gpio_get_level(MQ2_DO_GPIO) };
    BaseType_t xHigherPriorityTaskWoken = pdFALSE;
    if (mq2_evt_queue) xQueueSendFromISR(mq2_evt_queue, &evt, &xHigherPriorityTaskWoken);
    if (xHigherPriorityTaskWoken) portYIELD_FROM_ISR();
}

static esp_err_t nvs_load_params(void)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(MQ2_NVS_NAMESPACE, NVS_READWRITE, &h);
    if (err != ESP_OK) return err;

    // 读取阈值
    int32_t v32 = 0;
    err = nvs_get_i32(h, "thresh_raw", &v32);
    if (err == ESP_OK) saved_thresh_raw = v32;

    // 读取校准（以 blob 形式存 float[2])
    size_t required = 0;
    err = nvs_get_blob(h, "calib", NULL, &required);
    if (err == ESP_OK && required == sizeof(float)*2) {
        float buf[2];
        if (nvs_get_blob(h, "calib", buf, &required) == ESP_OK) {
            calib_slope = buf[0];
            calib_offset = buf[1];
        }
    }

    nvs_close(h);
    return ESP_OK;
}

esp_err_t mq2_init(void)
{
    esp_err_t err;

    // NVS 参数读取
    err = nvs_load_params();
    if (err != ESP_OK) ESP_LOGW(TAG, "NVS load params failed: %s", esp_err_to_name(err));

    // 配置 DO GPIO（输入，带中断）
    gpio_config_t io_conf = {
        .intr_type = GPIO_INTR_ANYEDGE,
        .mode = GPIO_MODE_INPUT,
        .pin_bit_mask = 1ULL << MQ2_DO_GPIO,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE
    };
    gpio_config(&io_conf);

    // 创建队列并安装 ISR 服务
    mq2_evt_queue = xQueueCreate(8, sizeof(mq2_do_evt_t));
    gpio_install_isr_service(0);
    gpio_isr_handler_add(MQ2_DO_GPIO, mq2_do_isr, NULL);

    // 初始化 ADC
    if (adc_manager_init() != ESP_OK) {
        ESP_LOGW(TAG, "adc manager init failed");
        return ESP_FAIL;
    }
    adc_handle = adc_manager_get_handle();
    if (!adc_handle) {
        ESP_LOGW(TAG, "no adc handle available");
        return ESP_FAIL;
    }
    adc_oneshot_chan_cfg_t chan_cfg = {
        .atten = MQ2_ADC_ATTEN,
        .bitwidth = MQ2_ADC_WIDTH,
    };
    ESP_ERROR_CHECK(adc_oneshot_config_channel(adc_handle, MQ2_ADC_CHANNEL, &chan_cfg));

    // 初始化滑动窗口
    memset(adc_window, 0, sizeof(adc_window));
    window_idx = 0;
    window_full = false;

    ESP_LOGI(TAG, "mq2 initialized (thresh_raw=%d, slope=%f, offset=%f)", saved_thresh_raw, calib_slope, calib_offset);
    return ESP_OK;
}

static int read_adc_raw_once(void)
{
    int raw = 0;
    // ADC1 读取：注意在某些 SDK/WiFi 情况下可能失败
    esp_err_t r = adc_oneshot_read(adc_handle, MQ2_ADC_CHANNEL, &raw);
    if (r != ESP_OK) {
        ESP_LOGW(TAG, "adc_oneshot_read err %s", esp_err_to_name(r));
        return -1;
    }
    return raw;
}

// 读取原始 ADC 值，并更新滑动窗口，返回平均值
int mq2_read_raw(void)
{
    int raw = read_adc_raw_once();
    if (raw < 0) return raw;

    // 移动平均
    adc_window[window_idx] = raw;
    window_idx = (window_idx + 1) % MQ2_MOVING_WINDOW;
    if (!window_full && window_idx == 0) window_full = true;

    int count = window_full ? MQ2_MOVING_WINDOW : window_idx;
    long sum = 0;
    for (int i = 0; i < count; i++) sum += adc_window[i];
    return (int)(sum / count);
}

// 简单线性换算，返回电压值
float mq2_read_voltage(void)
{
    int raw = mq2_read_raw();
    if (raw < 0) return -1.0f;
    // 简单线性换算：V = raw / 4095 * VREF. VREF 采用 3.3V（若需精确请使用 esp_adc_cal）
    const float VREF = 3.3f;
    return (raw / 4095.0f) * VREF;
}

// 估算 ppm 值，若未标定则返回 -1
float mq2_read_ppm(void)
{
    int raw = mq2_read_raw();
    if (raw < 0) return -1.0f;
    // 简单线性估算： ppm = slope * raw + offset
    float ppm = calib_slope * raw + calib_offset;
    return ppm;
}

// 获取 DO 状态（经过去抖/限流）
bool mq2_get_alarm(void)
{
    // 优先读取 DO 引脚（即时）
    int level = gpio_get_level(MQ2_DO_GPIO);
    return level != 0;
}

esp_err_t mq2_set_threshold_raw(int raw)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(MQ2_NVS_NAMESPACE, NVS_READWRITE, &h);
    if (err != ESP_OK) return err;
    err = nvs_set_i32(h, "thresh_raw", raw);
    if (err == ESP_OK) err = nvs_commit(h);
    nvs_close(h);
    if (err == ESP_OK) saved_thresh_raw = raw;
    return err;
}

int mq2_get_threshold_raw(void)
{
    return saved_thresh_raw;
}

static void mq2_event_task(void* arg)
{
    mq2_do_evt_t evt;
    for (;;) {
        if (xQueueReceive(mq2_evt_queue, &evt, pdMS_TO_TICKS(1000))) {
            // 简单去抖：忽略短时间内多次切换
            uint32_t now = esp_log_timestamp()/1000;
            if (now - last_alarm_ts < alarm_report_interval_s) {
                continue;
            }
            last_alarm_ts = now;
            // 设置标志，实际上报在主采样任务中读取并打包
            do_alarm_flag = evt.level;
            ESP_LOGI(TAG, "DO event level=%d ts=%u", evt.level, evt.ts);
        }
    }
    vTaskDelete(NULL);
}

static void mq2_sample_task(void* arg)
{
    const TickType_t delay_ticks = pdMS_TO_TICKS(MQ2_SAMPLE_INTERVAL_MS);
    for (;;) {
        // 读取 ADC 并更新滑动窗口
        mq2_read_raw();
        // 可在此处检查阈值并设置报警标志（若 AO 超过阈值）
        int raw = adc_window[(window_idx + MQ2_MOVING_WINDOW - 1) % MQ2_MOVING_WINDOW];
        if (raw >= saved_thresh_raw) {
            uint32_t now = esp_log_timestamp()/1000;
            if (now - last_alarm_ts >= (uint32_t)alarm_report_interval_s) {
                do_alarm_flag = true;
                last_alarm_ts = now;
                ESP_LOGI(TAG, "AO threshold triggered raw=%d", raw);
            }
        }
        vTaskDelay(delay_ticks);
    }
}

void mq2_task_start(void)
{
    xTaskCreate(mq2_event_task, "mq2_event_task", 2048, NULL, 6, NULL);
    xTaskCreate(mq2_sample_task, "mq2_sample_task", 3072, NULL, 5, NULL);
}
