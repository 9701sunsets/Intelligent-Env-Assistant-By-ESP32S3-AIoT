#include <stdio.h>

#include "FreeRTOS/freertos.h"
#include "FreeRTOS/task.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_wifi.h"
#include "nvs_flash.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "lwip/inet.h"
#include "esp_smartconfig.h"
// #include "esp_wpa2.h"

#include "led.h"
#include "wifi_manager.h"
#include "sensor/light_sensor.h"
#include "sensor/dht11.h"
#include "ui/led_control.h"

/**
 * @brief 应用程序的主入口点
 */
void app_main(void)
{
    esp_err_t ret;

    ret = nvs_flash_init();// 初始化 NVS 闪存
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    }

    led_init(); // 初始化 LED
    led_control_init(); // 初始化 LED 控制
    wifi_manager_init(); // 初始化 Wi-Fi 管理器
    wifi_manager_start_smartconfig(); // 启动 SmartConfig 配网

}