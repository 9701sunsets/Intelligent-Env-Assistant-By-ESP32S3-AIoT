#include <stdio.h>
#include "led.h"
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
 * @brief 扫描 Wi-Fi 网络的函数
 */
void wifi_scan(void)
{
    // 网卡初始化
    ESP_ERROR_CHECK(esp_netif_init());
    // 事件循环初始化
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    // 用户初始化STA模式的Wi-Fi
    esp_netif_t *sta_netif = esp_netif_create_default_wifi_sta();
    assert(sta_netif);
    // Wi-Fi配置
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    uint16_t number = DEFAULT_SCAN_LIST_SIZE;
    wifi_ap_record_t ap_info[DEFAULT_SCAN_LIST_SIZE];
    uint16_t ap_count = 0;
    memset(ap_info, 0, sizeof(ap_info));
    // 设置Wi-Fi工作模式为STA
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    // 启动Wi-Fi
    ESP_ERROR_CHECK(esp_wifi_start());
    // 扫描附近的Wi-Fi网络
    ESP_ERROR_CHECK(esp_wifi_scan_start(NULL, true));
    // 获取上次扫描到的AP数量
    ESP_ERROR_CHECK(esp_wifi_scan_get_ap_num(&ap_count));
    // 获取上次扫描到的AP列表
    ESP_ERROR_CHECK(esp_wifi_scan_get_ap_records(&number, ap_info));

    ESP_LOGI(TAG, "Total APs scanned = %u", ap_count);
    // 下面是打印附近的WIFI信息
    for (int i = 0; (i < DEFAULT_SCAN_LIST_SIZE) && (i < ap_count); i++) 
    {
        ESP_LOGI(TAG, "SSID \t\t%s", ap_info[i].ssid);
        ESP_LOGI(TAG, "RSSI \t\t%d", ap_info[i].rssi);
        ESP_LOGI(TAG, "Authmode \t\t%d", ap_info[i].authmode);
        ESP_LOGI(TAG, "Channel \t\t%d\n", ap_info[i].primary);
    }
}

/**
 * @brief 根据Wi-Fi连接状态设置LED颜色的函数
 * @param flag 连接状态标志，2表示连接成功，1表示连接失败，其他值表示正在连接
 */
void connect_display(uint8_t flag)
{
    if(flag == 2)
    {
        ESP_LOGI(TAG, "Connected to Wi-Fi, setting LED color to BLUE");
        led_strip_set_pixel(led_strip, 0, 0, 0, 255); // 设置为蓝色
        led_strip_refresh(led_strip);                 // 刷新灯带使颜色生效
    }
    else if(flag == 1)
    {
        ESP_LOGI(TAG, "Failed to connect to Wi-Fi, setting LED color to RED");
        led_strip_set_pixel(led_strip, 0, 255, 0, 0); // 设置为红色
        led_strip_refresh(led_strip);                 // 刷新灯带使颜色生效
    }
    else
    {
        ESP_LOGI(TAG, "Connecting to Wi-Fi, setting LED color to YELLOW");
        led_strip_set_pixel(led_strip, 0, 255, 255, 0); // 设置为黄色
        led_strip_refresh(led_strip);                   // 刷新灯带使颜色生效
    }
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
static void wifi_event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data)
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
}

/**
 * @brief 初始化Wi-Fi软AP的函数，注册Wi-Fi事件处理函数并设置软AP配置
 */
static void wifi_init_softap(void)
{
    ESP_ERROR_CHECK(esp_netif_init()); // 初始化网络接口
    ESP_ERROR_CHECK(esp_event_loop_create_default()); // 创建默认事件循环
    esp_netif_create_default_wifi_ap(); // 使用默认配置初始化包括netif的Wi-Fi AP
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT(); // 获取默认Wi-Fi初始化配置
    ESP_ERROR_CHECK(esp_wifi_init(&cfg)); // 初始化Wi-Fi模块

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL)); // 注册Wi-Fi事件处理函数
    // 配置Wi-Fi软AP的参数
    wifi_config_t wifi_config = {
        .ap = {
            .ssid = EXAMPLE_ESP_WIFI_SSID,
            .ssid_len = strlen(EXAMPLE_ESP_WIFI_SSID),
            .password = EXAMPLE_ESP_WIFI_PASS,
            .max_connection = EXAMPLE_MAX_STA_CONN,
            .authmode = WIFI_AUTH_WPA_WPA2_PSK
        },
    };

    if (strlen(EXAMPLE_ESP_WIFI_PASS) == 0) {
        wifi_config.ap.authmode = WIFI_AUTH_OPEN; // 如果密码为空，设置认证模式为开放
    }

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP)); // 设置Wi-Fi工作模式为AP
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi_config)); // 设置AP配置
    ESP_ERROR_CHECK(esp_wifi_start()); // 启动Wi-Fi模块

    esp_netif_ip_info_t ip_info;
    esp_netif_get_ip_info(esp_netif_get_handle_from_ifkey("WIFI_AP_DEFAULT"), &ip_info); // 获取AP的IP信息

    char ip_addr[16];
    ip4addr_ntoa_r((const ip4_addr_t *)&ip_info.ip, ip_addr, sizeof(ip_addr)); // 将IP地址转换为字符串格式(使用lwIP)
    ESP_LOGI(TAG_AP, "Set up softAP with IP: %s", ip_addr); // 打印AP的IP地址

    ESP_LOGI(TAG_AP, "wifi_init_softap finished. SSID:%s password:%s", EXAMPLE_ESP_WIFI_SSID, EXAMPLE_ESP_WIFI_PASS);

    connect_display(0); // 正在连接，设置LED为黄色
}

/**
 * @brief 一键配网回调函数
 * @param parm 参数
 */
static void smartconfig_task(void * parm)
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
}

/**
 * @brief Wi-Fi事件处理函数，根据不同的事件类型更新LED颜色并打印相关信息
 * @param arg 事件处理函数的参数
 * @param event_base 事件基础，指示事件所属的模块
 * @param event_id 事件ID，指示事件的具体类型
 * @param event_data 事件数据，包含与事件相关的详细信息
 */
static void event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data)
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
}

/**
 * @brief 初始化Wi-Fi SmartConfig的函数，注册Wi-Fi事件处理函数并启动SmartConfig
 */
void wifi_smartconfig_sta(void)
{
    ESP_ERROR_CHECK(esp_netif_init()); // 初始化网络接口
    s_wifi_event_group = xEventGroupCreate(); // 创建一个事件标志组
    ESP_ERROR_CHECK(esp_event_loop_create_default()); // 创建默认事件循环
    esp_netif_t *sta_netif = esp_netif_create_default_wifi_sta(); // 使用默认配置初始化包括netif的Wi-Fi STA
    assert(sta_netif);
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT(); // 获取默认Wi-Fi初始化配置
    ESP_ERROR_CHECK(esp_wifi_init(&cfg)); // 初始化Wi-Fi模块

    // 注册Wi-Fi事件处理函数，处理所有Wi-Fi事件和STA获取IP事件
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &event_handler, NULL)); // 注册Wi-Fi事件处理函数
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &event_handler, NULL)); // 注册IP事件处理函数
    ESP_ERROR_CHECK(esp_event_handler_register(SC_EVENT, ESP_EVENT_ANY_ID, &event_handler, NULL)); // 注册SmartConfig事件处理函数

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA)); // 设置Wi-Fi工作模式为STA
    ESP_ERROR_CHECK(esp_wifi_start()); // 启动Wi-Fi模块

    ESP_LOGI(TAG, "wifi_init_smartconfig finished.");
}

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
    // wifi_sta_init(); // 初始化 Wi-Fi 连接
    // wifi_scan(); // 扫描 Wi-Fi 网络
    // wifi_init_softap(); // 初始化 Wi-Fi 软AP
    wifi_smartconfig_sta(); // 初始化 Wi-Fi SmartConfig

    // 灯带测试
    /* while (1)
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
    } */
}