#include "stdio.h"
#include "light_sensor.h"
#include "sensor/adc_manager.h"
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <driver/gpio.h>
#include "esp_adc/adc_oneshot.h"
#include "soc/adc_channel.h"
#include <esp_err.h>
#include "esp_log.h"

static const char *TAG = "light_sensor";
static adc_oneshot_unit_handle_t adc_handle = NULL;

// 定义光照传感器连接的GPIO引脚
#define ADC_UNIT_ID       ADC_UNIT_1
#define ADC_CH            ADC_CHANNEL_4    // 对应 ADC1 通道，根据硬件调整
#define ADC_ATTEN         ADC_ATTEN_DB_12
#define ADC_BIT_WIDTH     ADC_BITWIDTH_DEFAULT
#define ADC_MAX           ((1 << 12) - 1)
#define VREF              3.3f

// 初始化 ADC 光敏
void init_light_sensor(void)
{
    // 确保 adc manager 已初始化
    if (!adc_manager_get_handle()) {
        if (adc_manager_init() != ESP_OK) {
            ESP_LOGW(TAG, "adc_manager_init failed");
            return;
        }
    }

    adc_handle = adc_manager_get_handle();
    if (!adc_handle) {
        ESP_LOGW(TAG, "no adc handle available");
        return;
    }

    adc_oneshot_chan_cfg_t chan_cfg = {
        .bitwidth = ADC_BITWIDTH_DEFAULT,
        .atten = ADC_ATTEN
    };
    esp_err_t r = adc_oneshot_config_channel(adc_handle, ADC_CH, &chan_cfg);
    if (r != ESP_OK) {
        ESP_LOGW(TAG, "adc_oneshot_config_channel failed: %s", esp_err_to_name(r));
    }
}

// 读取光照传感器的原始 ADC 值
int read_light_raw(void)
{
    if (!adc_handle) {
        adc_handle = adc_manager_get_handle();
        if (!adc_handle) {
            ESP_LOGW(TAG, "adc handle missing in read_light_raw");
            return ADC_MAX;
        }
    }
    int raw = 0;
    esp_err_t r = adc_oneshot_read(adc_handle, ADC_CH, &raw);
    if (r != ESP_OK) {
        ESP_LOGW(TAG, "adc_oneshot_read failed: %s", esp_err_to_name(r));
        return ADC_MAX;
    }
    return raw;
}

// 读取光照传感器的电压值
float read_light_voltage(void)
{
    int raw = read_light_raw();
    return ((float)raw / ADC_MAX) * VREF;
}