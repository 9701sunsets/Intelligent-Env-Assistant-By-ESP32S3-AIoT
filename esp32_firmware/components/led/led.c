#include <stdio.h>
#include "led.h"
#include "driver/gpio.h"
#include "led_strip.h"
#include "esp_log.h"

#define BLINK_GPIO GPIO_NUM_38

const char *TAG = "led";
led_strip_handle_t led_strip = NULL;//灯带句柄

void led_init(void)
{
    ESP_LOGI(TAG, "Initializing LED on GPIO %d", BLINK_GPIO);

    //LED灯带配置
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

    led_strip_clear(led_strip); //清除灯带显示
}
