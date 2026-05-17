#include <stdio.h>
#include "led.h"
#include "FreeRTOS/freertos.h"
#include "FreeRTOS/task.h"
#include "esp_log.h"
#include "esp_mac.h"

//const char *TAG = "led";

void app_main(void)
{
    configure_led(); // 配置 LED

    while (1)
    {

        ESP_LOGI(TAG, "Set LED color to RED");
        led_strip_set_pixel(led_strip, 0, 255, 0, 0); // 设置为红色
        led_strip_refresh(led_strip);                 // 刷新灯带使颜色生效
        vTaskDelay(pdMS_TO_TICKS(1000));              // 延时 1000 毫秒

        ESP_LOGI(TAG, "Clear LED color");
        led_strip_clear(led_strip);      // 清空灯带，熄灭 LED
        vTaskDelay(pdMS_TO_TICKS(1000)); // 延时 1000 毫秒

        ESP_LOGI(TAG, "Set LED color to GREEN");
        led_strip_set_pixel(led_strip, 0, 0, 255, 0); // 设置为绿色
        led_strip_refresh(led_strip);                 // 刷新灯带使颜色生效
        vTaskDelay(pdMS_TO_TICKS(1000));              // 延时 1000 毫秒

        ESP_LOGI(TAG, "Clear LED color");
        led_strip_clear(led_strip);      // 清空灯带，熄灭 LED
        vTaskDelay(pdMS_TO_TICKS(1000)); // 延时 1000 毫秒
    }
}