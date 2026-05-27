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
#include "esp_sntp.h"

#include "led.h"
#include "wifi_manager.h"
#include "sensor/light_sensor.h"
#include "sensor/dht11.h"
#include "ui/led_control.h"
#include "cloud/mqtt_clients.h"
#include "ota/ota_update.h"
#include "sensor/mq2.h"

extern void mqtt_main_task(void *arg);

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

    // nvs_handle_t h;
    // nvs_open("wifi", NVS_READWRITE, &h);
    // nvs_erase_key(h, "sta_cfg");
    // nvs_commit(h);
    // nvs_close(h);
    // ESP_LOGI("TEST", "Cleared saved WiFi config for testing");

    led_init(); // 初始化 LED
    led_control_init(); // 初始化 LED 控制
    wifi_manager_init(); // 初始化 Wi-Fi 管理器
    esp_log_level_set("wifi", ESP_LOG_DEBUG); // 设置 Wi-Fi 管理器模块的日志级别为 DEBUG
    esp_log_level_set("wifi_manager", ESP_LOG_DEBUG); // 设置 Wi-Fi 管理器模块的日志级别为 DEBUG
    wifi_manager_auto_connect_or_start_softap(20000); // 尝试自动连接 Wi-Fi，超时后启动 SoftAP 模式

    //trigger_ota_once();

    // 创建 MQTT 客户端任务
    xTaskCreate(mqtt_main_task, "mqtt_main_task", 8192, NULL, 5, NULL);

    // 初始化 MQ2 传感器
    mq2_init();
    mq2_task_start();
}