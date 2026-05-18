#include "led.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

#define BLINK_GPIO GPIO_NUM_38

const char *TAG = "led";
led_strip_handle_t led_strip = NULL; //灯带句柄

static SemaphoreHandle_t s_led_mutex = NULL; // LED操作互斥锁
static TaskHandle_t s_effect_task = NULL; // LED效果任务句柄

static void apply_color(uint8_t r, uint8_t g, uint8_t b)
{
    if (led_strip)
    {
        led_strip_set_pixel(led_strip, 0, r, g, b);
        led_strip_refresh(led_strip);
    }
}

void led_init(void)
{
    // 创建互斥锁
    if(s_led_mutex == NULL)
    {
        s_led_mutex = xSemaphoreCreateMutex();
    }

    ESP_LOGI(TAG, "Initializing LED on GPIO %d", BLINK_GPIO);

    // LED灯带配置
    led_strip_config_t strip_config = {
        .max_leds = 1, //灯带上LED的数量
        .strip_gpio_num = BLINK_GPIO, //连接到灯带的GPIO引脚
        .color_component_format = LED_STRIP_COLOR_COMPONENT_FMT_GRB, //灯带颜色
    };

    //RMT后端特定配置
    led_strip_rmt_config_t rmt_config = {
        .resolution_hz = 10 * 1000 * 1000, //RMT分辨率，10MHz
        .flags.with_dma = false, //禁用DMA
    };

    //创建LED灯带实例
    ESP_ERROR_CHECK(led_strip_new_rmt_device(&strip_config, &rmt_config, &led_strip));

    led_off(); //清除灯带显示
}

void led_set_rgb(uint8_t r, uint8_t g, uint8_t b)
{
    if (s_led_mutex)
    {
        xSemaphoreTake(s_led_mutex, portMAX_DELAY);
    }
    // 如果当前有正在运行的效果，先停止它
    if (s_effect_task)
    {
        vTaskDelete(s_effect_task); //删除正在运行的效果任务
        s_effect_task = NULL;
    }
    apply_color(r, g, b);
    if (s_led_mutex)
    {
        xSemaphoreGive(s_led_mutex);
    }
}

void led_off(void)
{
    led_set_rgb(0, 0, 0); //设置为黑色，即关闭LED
}

void led_set_color_enum(int color_id)
{
    switch (color_id)
    {
        case 1: led_set_rgb(255, 0, 0); break; // 红色
        case 2: led_set_rgb(0, 255, 0); break; // 绿色
        case 3: led_set_rgb(0, 0, 255); break; // 蓝色
        case 4: led_set_rgb(255, 255, 0); break; // 黄色
        case 5: led_set_rgb(255, 255, 255); break; // 白色
        default: led_off(); break; // 默认关闭LED
    }
}

static void effect_task_fn(void *param)
{
    effect_t effect = *((effect_t *)param);
    free(param); // 释放传入的效果参数内存
    uint32_t count = 0;

    // 根据效果类型执行相应的LED效果
    while (effect.repeat == 0 || count < effect.repeat)
    {
        if (xTaskGetCurrentTaskHandle() == NULL) break;
        if (xSemaphoreTake(s_led_mutex, portMAX_DELAY) == pdTRUE)
        {
            apply_color(effect.r, effect.g, effect.b);
            xSemaphoreGive(s_led_mutex);
        }
        vTaskDelay(pdMS_TO_TICKS(effect.period_ms/2));
        if (xSemaphoreTake(s_led_mutex, portMAX_DELAY) == pdTRUE)
        {
            apply_color(0,0,0);
            xSemaphoreGive(s_led_mutex);
        }
        vTaskDelay(pdMS_TO_TICKS(effect.period_ms/2));
        if (effect.repeat != 0) count++;
    }
    s_effect_task = NULL; // 清除任务句柄
    vTaskDelete(NULL); // 删除当前任务
}

void led_set_effect(effect_t *effect)
{
    if (effect == NULL) return;
    
    // 如果当前有正在运行的效果，先停止它
    if (s_effect_task)
    {
        vTaskDelete(s_effect_task); //删除正在运行的效果任务
        s_effect_task = NULL;
    }
    // 目前仅支持闪烁效果
    if (effect->type == LED_EFFECT_BLINK)
    {
        effect_t *effect_copy = malloc(sizeof(effect_t));
        if (effect_copy == NULL) return; // 内存分配失败
        *effect_copy = *effect; // 复制效果参数
        xTaskCreate(effect_task_fn, "led_effect", 2048, effect_copy, 5, &s_effect_task);
    }
}