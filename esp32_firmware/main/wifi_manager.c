#include "wifi_manager.h"
#include <string.h>
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_mac.h"
#include "esp_smartconfig.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "ui/led_control.h"
#include "esp_http_server.h"
#include "esp_http_client.h"
#include "cJSON.h"
#include "nvs.h"
#include "nvs_flash.h"

#define WIFI_NVS_NS "wifi"

static const char *TAG = "wifi_manager";
static EventGroupHandle_t s_wifi_event_group;
static httpd_handle_t s_http_server = NULL;
static bool s_ap_netif_created = false;

static const char *g_config_page =
"<html><head><meta charset='utf-8'><title>ESP Config</title></head>"
"<body><h3>配置 Wi-Fi</h3>"
"<form method='post' action='/config'>"
"SSID: <input name='ssid'><br>"
"Password: <input name='password' type='password'><br>"
"<input type='submit' value='提交'>"
"</form></body></html>";

static void wifi_apply_config_task(void *arg)
{
    wifi_config_t cfg = *(wifi_config_t *)arg;
    free(arg);

    ESP_LOGI(TAG, "Applying WiFi config: SSID=%s", cfg.sta.ssid);

    if (s_http_server) {
        httpd_stop(s_http_server);
        s_http_server = NULL;
        ESP_LOGI(TAG, "HTTP server stopped");
    }

    esp_err_t err;

    err = esp_wifi_stop();
    ESP_LOGI(TAG, "esp_wifi_stop -> %s", esp_err_to_name(err));

    err = esp_wifi_set_mode(WIFI_MODE_STA);
    ESP_LOGI(TAG, "esp_wifi_set_mode(STA) -> %s", esp_err_to_name(err));

    err = esp_wifi_set_config(WIFI_IF_STA, &cfg);
    ESP_LOGI(TAG, "esp_wifi_set_config(WIFI_IF_STA) -> %s", esp_err_to_name(err));

    err = esp_wifi_start();
    ESP_LOGI(TAG, "esp_wifi_start -> %s", esp_err_to_name(err));

    err = esp_wifi_connect();
    ESP_LOGI(TAG, "esp_wifi_connect -> %s", esp_err_to_name(err));

    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group, BIT0, pdFALSE, pdFALSE, pdMS_TO_TICKS(20000));
    if (bits & BIT0) {
        ESP_LOGI(TAG, "Connected to AP %s", cfg.sta.ssid);
    } else {
        ESP_LOGW(TAG, "Failed to connect to AP %s within timeout, restarting SoftAP HTTP", cfg.sta.ssid);
        // 若失败：清理并重启 softAP/http，便于用户重试
        esp_wifi_stop();
        wifi_manager_start_softap_http();
    }

    vTaskDelay(pdMS_TO_TICKS(100)); // 给驱动一点时间
    vTaskDelete(NULL);
}

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
        wifi_event_sta_disconnected_t *evt = (wifi_event_sta_disconnected_t *)event_data;
        ESP_LOGI(TAG, "WIFI disconnected, reason=%d", evt ? evt->reason : -1);
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
    
    // 只在未创建时创建 AP 默认 netif，避免重复创建导致断言
    if (!s_ap_netif_created) {
        esp_netif_create_default_wifi_ap();
        s_ap_netif_created = true;
    }
    // 只设置模式和配置，启动由外层控制（配合 HTTP server）
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));

    // TODO 参数封装
    wifi_config_t wifi_config = {
        .ap = {
            .ssid = "ESP_SoftAP",
            .ssid_len = 0,
            .password = "12345678",
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

static esp_err_t save_wifi_config_nvs(const wifi_config_t *cfg)
{
    nvs_handle_t h;
    if (nvs_open(WIFI_NVS_NS, NVS_READWRITE, &h) != ESP_OK) return ESP_FAIL;
    esp_err_t err = nvs_set_blob(h, "sta_cfg", cfg, sizeof(wifi_config_t));
    if (err == ESP_OK) nvs_commit(h);
    nvs_close(h);
    return err;
}

static esp_err_t load_wifi_config_nvs(wifi_config_t *cfg)
{
    nvs_handle_t h;
    size_t required = sizeof(wifi_config_t);
    if (nvs_open(WIFI_NVS_NS, NVS_READONLY, &h) != ESP_OK) return ESP_ERR_NVS_NOT_FOUND;
    esp_err_t err = nvs_get_blob(h, "sta_cfg", cfg, &required);
    nvs_close(h);
    return err;
}

static esp_err_t http_get_root(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, g_config_page, strlen(g_config_page));
    return ESP_OK;
}

/* URL decode helper */
static void url_decode(char *dst, const char *src)
{
    while (*src) {
        if (*src == '%') {
            char hex[3] = { src[1], src[2], 0 };
            *dst++ = (char) strtol(hex, NULL, 16);
            src += 3;
        } else if (*src == '+') {
            *dst++ = ' ';
            src++;
        } else {
            *dst++ = *src++;
        }
    }
    *dst = '\0';
}

static esp_err_t http_post_config(httpd_req_t *req)
{
    int content_len = req->content_len;
    if (content_len <= 0) {
        httpd_resp_send_404(req);
        return ESP_FAIL;
    }

    char *buf = calloc(1, content_len + 1);
    if (!buf) return ESP_FAIL;
    int ret = httpd_req_recv(req, buf, content_len);
    buf[ret] = '\0';

    char ssid[33] = {0}, pwd[65] = {0};
    // 使用 esp_http_server 提供的解析器解析 application/x-www-form-urlencoded
    httpd_query_key_value(buf, "ssid", ssid, sizeof(ssid));
    httpd_query_key_value(buf, "password", pwd, sizeof(pwd));
    free(buf);

    if (strlen(ssid) == 0) {
        httpd_resp_sendstr(req, "ssid empty");
        return ESP_FAIL;
    }

    // 防止用户误把当前设备 AP SSID 填入（避免连到自己）
    wifi_config_t ap_cfg;
    if (esp_wifi_get_config(WIFI_IF_AP, &ap_cfg) == ESP_OK) {
        if (strcmp((char*)ap_cfg.ap.ssid, ssid) == 0) {
            httpd_resp_sendstr(req, "SSID is device AP; please enter your router SSID.");
            return ESP_FAIL;
        }
    }

    wifi_config_t wifi_cfg = {0};
    strncpy((char*)wifi_cfg.sta.ssid, ssid, sizeof(wifi_cfg.sta.ssid)-1);
    strncpy((char*)wifi_cfg.sta.password, pwd, sizeof(wifi_cfg.sta.password)-1);

    if (save_wifi_config_nvs(&wifi_cfg) == ESP_OK) {
        // 读回验证，便于调试
        wifi_config_t verify = {0};
        if (load_wifi_config_nvs(&verify) == ESP_OK) {
            ESP_LOGI(TAG, "Saved NVS SSID=%s, PWD(len)=%d", verify.sta.ssid, (int)strlen((char*)verify.sta.password));
        } else {
            ESP_LOGW(TAG, "Failed to read back saved NVS");
        }

        httpd_resp_sendstr(req, "OK, saved. Device will connect.");

        // 在独立任务中应用配置（你已有 wifi_apply_config_task）
        wifi_config_t *task_arg = malloc(sizeof(wifi_config_t));
        if (task_arg) {
            *task_arg = wifi_cfg;
            if (xTaskCreate(wifi_apply_config_task, "wifi_apply", 4096, task_arg, 5, NULL) != pdPASS) {
                free(task_arg);
                ESP_LOGW(TAG, "Failed to create wifi_apply task");
            }
        }
        return ESP_OK;
    } else {
        httpd_resp_sendstr(req, "NVS save failed");
        return ESP_FAIL;
    }
}

void wifi_manager_start_softap_http(void)
{
    // 启 SoftAP（复用已有 start_softap 实现或稍改）
    wifi_manager_start_softap();

    // 启动 http server
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    if (httpd_start(&s_http_server, &config) == ESP_OK) {
        httpd_uri_t uri_get = {
            .uri = "/",
            .method = HTTP_GET,
            .handler = http_get_root
        };
        httpd_register_uri_handler(s_http_server, &uri_get);

        httpd_uri_t uri_post = {
            .uri = "/config",
            .method = HTTP_POST,
            .handler = http_post_config
        };
        httpd_register_uri_handler(s_http_server, &uri_post);
    } else {
        ESP_LOGE(TAG, "Failed to start HTTP server");
    }
}

void wifi_manager_stop_softap_http(void)
{
    if (s_http_server) {
        httpd_stop(s_http_server);
        s_http_server = NULL;
    }
    // 停止 AP 模式：设为 NULL 或切换到 OFF，再由 STA 模式覆盖
    // 这里只做最小处理：esp_wifi_stop() 可以在切换前调用（视情况而定）
    ESP_ERROR_CHECK(esp_wifi_stop());
}

esp_err_t wifi_manager_auto_connect_or_start_softap(uint32_t timeout_ms)
{
    wifi_config_t cfg;
    if (load_wifi_config_nvs(&cfg) == ESP_OK && strlen((char*)cfg.sta.ssid) > 0) {
        ESP_LOGI(TAG, "Found stored SSID: %s", cfg.sta.ssid);
        ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
        ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &cfg));
        ESP_ERROR_CHECK(esp_wifi_start());
        esp_wifi_connect();

        // 等待连接事件（简化：用事件组 BIT0 在 wifi_event_handler 里设置）
        EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group, BIT0, pdFALSE, pdFALSE, pdMS_TO_TICKS(timeout_ms));
        if (bits & BIT0) {
            ESP_LOGI(TAG, "Auto connect success");
            return ESP_OK;
        }
        ESP_LOGW(TAG, "Auto connect timeout/fail, start SoftAP HTTP");
    } else {
        ESP_LOGI(TAG, "No stored WiFi config, starting SoftAP HTTP");
    }

    wifi_manager_start_softap_http();
    return ESP_FAIL;
}