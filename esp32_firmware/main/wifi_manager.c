#include "wifi_manager.h"
#include <string.h>
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_mac.h"
#include "esp_smartconfig.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "ui/led_control.h"

static const char *TAG = "wifi_manager";
static EventGroupHandle_t s_wifi_event_group;

static void esp_log_buffer_hex_safe(const char *tag, const void *buffer, size_t len)
{
    const uint8_t *b = (const uint8_t *)buffer;
    char line[3 * 16 + 1];
    for (size_t off = 0; off < len; off += 16) {
        size_t chunk = (len - off) > 16 ? 16 : (len - off);
        char *p = line;
        for (size_t i = 0; i < chunk; ++i) {
            p += sprintf(p, "%02x ", b[off + i]);
        }
        *p = '\0';
        ESP_LOGI(tag, "%s", line);
    }
}

EventGroupHandle_t wifi_manager_get_event_group(void)
{
    return s_wifi_event_group;
}

static void wifi_event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        ESP_LOGI(TAG, "WIFI_EVENT_STA_START");
        led_display_wifi_connecting();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGI(TAG, "WIFI disconnected, reconnecting...");
        esp_wifi_connect();
        led_display_wifi_connecting();
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "Got IP:" IPSTR, IP2STR(&event->ip_info.ip));
        xEventGroupSetBits(s_wifi_event_group, BIT0); // CONNECTED_BIT
        led_display_wifi_connected();
    }
}

/* SmartConfig 和 SC 事件处理（简化） */
static void sc_event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data)
{
    if (event_id == SC_EVENT_SCAN_DONE) {
        ESP_LOGI(TAG, "SC_EVENT_SCAN_DONE");
        led_display_wifi_connecting();
    } else if (event_id == SC_EVENT_FOUND_CHANNEL) {
        if (event_data) {
            ESP_LOGI(TAG, "SC_EVENT_FOUND_CHANNEL (raw):");
            esp_log_buffer_hex_safe(TAG, event_data, 8); // 打印前 8 字节进行调试
    } else {
        ESP_LOGW(TAG, "SC_EVENT_FOUND_CHANNEL with NULL data");
    }
    } else if (event_id == SC_EVENT_GOT_SSID_PSWD) {
        if (!event_data) {
            ESP_LOGW(TAG, "SC_EVENT_GOT_SSID_PSWD with NULL data");
            return;
        }
        ESP_LOGI(TAG, "SC_EVENT_GOT_SSID_PSWD");
        smartconfig_event_got_ssid_pswd_t *evt = (smartconfig_event_got_ssid_pswd_t *)event_data;

        char ssid[33] = {0}, pwd[65] = {0};
        memcpy(ssid, evt->ssid, sizeof(evt->ssid));
        memcpy(pwd, evt->password, sizeof(evt->password));
        ESP_LOGI(TAG, "Received SSID: %s", ssid);
        ESP_LOGI(TAG, "Received PWD: %s", pwd);
        ESP_LOGI(TAG, "bssid_set=%d, type=%d", evt->bssid_set, evt->type);

        if (evt->type == SC_TYPE_ESPTOUCH_V2) {
            uint8_t rvd_data[33] = {0};
            if (esp_smartconfig_get_rvd_data(rvd_data, sizeof(rvd_data)) == ESP_OK) {
                esp_log_buffer_hex_safe(TAG, rvd_data, sizeof(rvd_data));
            } else {
                ESP_LOGW(TAG, "No RVD data");
            }
        }

        wifi_config_t wifi_config = {0};
        memcpy(wifi_config.sta.ssid, evt->ssid, sizeof(evt->ssid));
        memcpy(wifi_config.sta.password, evt->password, sizeof(evt->password));
        ESP_ERROR_CHECK(esp_wifi_disconnect());
        ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
        ESP_ERROR_CHECK(esp_wifi_connect());
        led_display_wifi_connecting();
    } else if (event_id == SC_EVENT_SEND_ACK_DONE) {
        xEventGroupSetBits(s_wifi_event_group, BIT1);
    }
}

esp_err_t wifi_manager_init(void)
{
    esp_err_t err;

    // 初始化 TCP/IP 网络接口
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    // 创建默认的Wi-Fi STA网络接口
    esp_netif_t *sta_netif = esp_netif_create_default_wifi_sta();
    if(!sta_netif) {
        ESP_LOGE(TAG, "esp_netif_create_default_wifi_sta failed");
        return ESP_FAIL;
    }
    s_wifi_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(SC_EVENT, ESP_EVENT_ANY_ID, &sc_event_handler, NULL));
    
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    err = esp_wifi_init(&cfg);
    return err;
}

void wifi_manager_start_smartconfig(void)
{
    ESP_LOGI(TAG, "Starting smartconfig STA");
    ESP_ERROR_CHECK(esp_smartconfig_set_type(SC_TYPE_ESPTOUCH));
    smartconfig_start_config_t cfg = SMARTCONFIG_START_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_ERROR_CHECK(esp_smartconfig_start(&cfg));
}

void wifi_manager_start_softap(void)
{
    ESP_LOGI(TAG, "Starting softAP");
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    wifi_config_t wifi_config = {
        .ap = {
            .ssid = "ESP32S3 WIFI",
            .ssid_len = 0,
            .password = "123456789",
            .max_connection = 5,
            .authmode = WIFI_AUTH_WPA_WPA2_PSK
        },
    };
    if (strlen((char*)wifi_config.ap.password) == 0) {
        wifi_config.ap.authmode = WIFI_AUTH_OPEN;
    }
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
}

void wifi_manager_scan(void)
{
    ESP_LOGI(TAG, "Start scan");
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_ERROR_CHECK(esp_wifi_scan_start(NULL, true));
}

/**
 * @brief WIFI链接回调函数/Wi-Fi事件处理函数，根据不同的事件类型更新LED颜色并打印相关信息
 * @param arg 事件处理函数的参数
 * @param event_base 事件基础，指示事件所属的模块
 * @param event_id 事件ID，指示事件的具体类型
 * @param event_data 事件数据，包含与事件相关的详细信息
 */
/* static void wifi_event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data)
{
    static int s_retry_num = 0;

    // 扫描到要连接的WIFI事件
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START)
    {
        connect_display(0); // 正在连接，设置LED为黄色
        esp_wifi_connect();
    }
    // 链接WIFI事件
    else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_CONNECTED)
    {
        connect_display(2); // 连接成功，设置LED为蓝色
    }
    // 链接失败事件
    else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED)
    {
        // 尝试链接
        if (s_retry_num < 20)
        {
            esp_wifi_connect();
            s_retry_num++;
            ESP_LOGI(TAG, "Retrying to connect to the AP");
        } 
        else
        {
            connect_display(1); // 连接失败，设置LED为红色
            ESP_LOGI(TAG, "Failed to connect to the AP");
            xEventGroupSetBits(wifi_event_group, WIFI_FAIL_BIT); // 设置连接失败事件标志
        }
    }
    // 工作站从链接的Wi-Fi网络获取IP地址事件
    else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP)
    {
        connect_display(2); // 连接成功，设置LED为蓝色
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));
        s_retry_num = 0; // 重置重试次数
        xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT); // 设置连接成功事件标志
    }
} */

/**
 * @brief 初始化Wi-Fi连接的函数，创建事件组并注册Wi-Fi事件处理函数
 */
/* void wifi_sta_init(void)
{
    static esp_netif_t *sta_netif = NULL;
    wifi_event_group = xEventGroupCreate(); // 创建一个事件标志组
    // 网卡初始化
    ESP_ERROR_CHECK(esp_netif_init()); 
    // 创建新的事件循环
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    sta_netif = esp_netif_create_default_wifi_sta();
    assert(sta_netif);
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    wifi_config_t wifi_config = WIFICONFIG();
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    // 等待链接成功后IP生成
    EventBits_t bits = xEventGroupWaitBits(wifi_event_group, 
        WIFI_CONNECTED_BIT | WIFI_FAIL_BIT, 
        pdFALSE, 
        pdFALSE, 
        portMAX_DELAY);

    // 根据事件标志判断链接结果
    if (bits & WIFI_CONNECTED_BIT)
    {        
        ESP_LOGI(TAG, "Connected to AP SSID:%s password:%s", DEFAULT_SSID, DEFAULT_PASSWORD);
    }
    else if (bits & WIFI_FAIL_BIT)
    {
        ESP_LOGI(TAG, "Failed to connect to SSID:%s, password:%s", DEFAULT_SSID, DEFAULT_PASSWORD);
    }
    else
    {
        ESP_LOGE(TAG, "UNEXPECTED EVENT");
    }
} */

/**
 * @brief Wi-Fi事件处理函数，根据不同的事件类型更新LED颜色并打印相关信息
 * @param arg 事件处理函数的参数
 * @param event_base 事件基础，指示事件所属的模块
 * @param event_id 事件ID，指示事件的具体类型
 * @param event_data 事件数据，包含与事件相关的详细信息
 */
/* static void wifi_event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data)
{
    // 设备链接
    if (event_id == WIFI_EVENT_AP_STACONNECTED)
    {
        wifi_event_ap_staconnected_t* event = (wifi_event_ap_staconnected_t*) event_data;
        ESP_LOGI(TAG_AP, "Station " MACSTR " join, AID=%d", MAC2STR(event->mac), event->aid);
        // 连接成功，设置LED为蓝色
        connect_display(2);
    }
    // 设备断开链接
    else if (event_id == WIFI_EVENT_AP_STADISCONNECTED)
    {
        wifi_event_ap_stadisconnected_t* event = (wifi_event_ap_stadisconnected_t*) event_data;
        ESP_LOGI(TAG_AP, "Station " MACSTR " leave, AID=%d", MAC2STR(event->mac), event->aid);
        // 连接失败，设置LED为红色
        connect_display(1);
    }
} */

/**
 * @brief 一键配网回调函数
 * @param parm 参数
 */
/* static void smartconfig_task(void * parm)
{
    parm = parm; // 避免编译器警告未使用参数
    EventBits_t uxBits;
    // 设置配网协议
    ESP_ERROR_CHECK(esp_smartconfig_set_type(SC_TYPE_ESPTOUCH));
    // 设置配网参数
    smartconfig_start_config_t cfg = SMARTCONFIG_START_CONFIG_DEFAULT();
    // 启动配网
    ESP_ERROR_CHECK(esp_smartconfig_start(&cfg));

    while(1) 
    {
        // 获取事件
        uxBits = xEventGroupWaitBits(s_wifi_event_group, CONNECTED_BIT | ESPTOUCH_DONE_BIT, true, false, portMAX_DELAY);

        if(uxBits & CONNECTED_BIT) 
        {
            ESP_LOGI(TAG, "Wi-Fi Connected to ap");
        }

        if(uxBits & ESPTOUCH_DONE_BIT) 
        {
            ESP_LOGI(TAG, "Smartconfig over");
            esp_smartconfig_stop(); // 停止配网
            vTaskDelete(NULL); // 删除当前任务
        }
    }
} */

/**
 * @brief Wi-Fi事件处理函数，根据不同的事件类型更新LED颜色并打印相关信息
 * @param arg 事件处理函数的参数
 * @param event_base 事件基础，指示事件所属的模块
 * @param event_id 事件ID，指示事件的具体类型
 * @param event_data 事件数据，包含与事件相关的详细信息
 */
/* static void event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data)
{
    if(event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START)
    {
        xTaskCreate(smartconfig_task, "smartconfig_task", 4096, NULL, 3, NULL);
    }
    else if(event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED)
    {
        esp_wifi_connect();
        xEventGroupClearBits(s_wifi_event_group, CONNECTED_BIT);
    }
    else if(event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP)
    {
        xEventGroupSetBits(s_wifi_event_group, CONNECTED_BIT);
    }
    else if(event_base == SC_EVENT && event_id == SC_EVENT_SCAN_DONE)
    {
        ESP_LOGI(TAG, "Scan done");
        connect_display(0); // 正在连接，设置LED为黄色
    }
    else if(event_base == SC_EVENT && event_id == SC_EVENT_FOUND_CHANNEL)
    {
        ESP_LOGI(TAG, "Found channel");
    }
    else if(event_base == SC_EVENT && event_id == SC_EVENT_GOT_SSID_PSWD)
    {
        ESP_LOGI(TAG, "Got SSID and password");

        smartconfig_event_got_ssid_pswd_t *evt = (smartconfig_event_got_ssid_pswd_t *)event_data;
        wifi_config_t wifi_config;
        uint8_t ssid[33] = {0};
        uint8_t password[65] = {0};
        uint8_t rvd_data[33] = {0};

        bzero(&wifi_config, sizeof(wifi_config_t));
        memcpy(wifi_config.sta.ssid, evt->ssid, sizeof(wifi_config.sta.ssid));
        memcpy(wifi_config.sta.password, evt->password, sizeof(wifi_config.sta.password));
        wifi_config.sta.bssid_set = evt->bssid_set;

        if(wifi_config.sta.bssid_set == true) 
        {
            memcpy(wifi_config.sta.bssid, evt->bssid, sizeof(wifi_config.sta.bssid));
        }

        memcpy(ssid, evt->ssid, sizeof(evt->ssid));
        memcpy(password, evt->password, sizeof(evt->password));
        ESP_LOGI(TAG, "SSID:%s", ssid);
        ESP_LOGI(TAG, "PASSWORD:%s", password);
        connect_display(2); // 连接成功，设置LED为蓝色

        // 手机APPEspTouch软件使用ESPTOUCH V2模式，会执行如下代码获取手机发送的额外数据（如果有的话）
        if(evt->type == SC_TYPE_ESPTOUCH_V2) 
        {
            ESP_ERROR_CHECK(esp_smartconfig_get_rvd_data(rvd_data, sizeof(rvd_data)));
            ESP_LOGI(TAG, "RVD DATA:");

            for(int i = 0; i < sizeof(rvd_data); i++) 
            {
                printf("%02x ", rvd_data[i]);
            }

            printf("\n");
        } 
        
        ESP_ERROR_CHECK(esp_wifi_disconnect());
        ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
        ESP_ERROR_CHECK(esp_wifi_connect());
    }
    else if(event_base == SC_EVENT && event_id == SC_EVENT_SEND_ACK_DONE)
    {
        xEventGroupSetBits(s_wifi_event_group, ESPTOUCH_DONE_BIT);
    }
} */