#include <stdio.h>

#include "led.h"
#include "wifi_manager.h"
#include "light_sensor.h"
#include "dht11.h"

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

#define DEFAULT_SCAN_LIST_SIZE 12

/* 链接WIFI名称 */
#define DEFAULT_SSID "****"
/* Wi-Fi 密码 */
#define DEFAULT_PASSWORD "****"
/* 事件标志 */
static EventGroupHandle_t wifi_event_group;
#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT      BIT1
/* WIFI默认配置 */
#define WIFICONFIG() { \
    .sta = { \
        .ssid = DEFAULT_SSID, \
        .password = DEFAULT_PASSWORD, \
        .threshold.authmode = WIFI_AUTH_WPA2_PSK, \
    }, \
}

static const char *TAG_AP = "AP";
#define EXAMPLE_ESP_WIFI_SSID "ESP32S3 WIFI"
#define EXAMPLE_ESP_WIFI_PASS "123456789"
#define EXAMPLE_MAX_STA_CONN 5
#define MAC2STR(a) (a)[0], (a)[1], (a)[2], (a)[3], (a)[4], (a)[5]
#define MACSTR "%02x:%02x:%02x:%02x:%02x:%02x"

static EventGroupHandle_t s_wifi_event_group;
#define CONNECTED_BIT BIT0
#define ESPTOUCH_DONE_BIT BIT1


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