#include "esp_log.h"
#include "mqtt_client.h"
#include "esp_netif.h"
#include "lwip/inet.h"
#include "cJSON.h"
#include "utils/json_parser.h"
#include <string.h>
#include "wifi_manager.h"
#include "ui/led_control.h"
#include "mqtt_clients.h"
#include "led.h"

static const char *TAG = "mqtt_client";
static esp_mqtt_client_handle_t g_mqtt_client = NULL;
static char g_device_id[48] = "esp32_001";
static char g_broker_host[64] = {0};
static int g_broker_port = 1883;

static const char *TOPIC_UPLOAD = "aiot/service/upload";
static const char *TOPIC_STATUS = "aiot/service/status";
static const char *TOPIC_CONTROL = "aiot/device/control";

// MQTT事件处理函数
static void mqtt_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data)
{
    esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;
    switch (event->event_id) {
        case MQTT_EVENT_CONNECTED:
            ESP_LOGI(TAG, "connected");
            esp_mqtt_client_subscribe(g_mqtt_client, TOPIC_CONTROL, 1);
            // publish online status later from task or here if ip known
            break;
        case MQTT_EVENT_DATA:
            ESP_LOGI(TAG, "topic: %.*s", event->topic_len, event->topic);
            if (event->topic_len == strlen(TOPIC_CONTROL) && strncmp(event->topic, TOPIC_CONTROL, event->topic_len) == 0) {
                char msg_id[64]={0}, state[16]={0}, color[16]={0}; int value=0;
                if (json_parse_control_led(event->data, event->data_len, msg_id, sizeof(msg_id), state, sizeof(state), color, sizeof(color), &value) == 0) {
                    if (strcmp(state, "on")==0) {
                        if (strcmp(color, "blue")==0) led_set_rgb(0,0,255);
                        else if (strcmp(color, "red")==0) led_set_rgb(255,0,0);
                        else if (strcmp(color, "green")==0) led_set_rgb(0,255,0);
                        else led_set_rgb(255,255,255);
                    } else {
                        led_display_off();
                    }
                }
            }
            break;
        default:
            break;
    }
}

// 初始化MQTT客户端
esp_err_t mqtt_client_init_with_broker(const char *broker_host, int broker_port, const char *device_id)
{
    if (broker_host) strncpy(g_broker_host, broker_host, sizeof(g_broker_host)-1);
    if (device_id) strncpy(g_device_id, device_id, sizeof(g_device_id)-1);
    g_broker_port = broker_port;

    esp_mqtt_client_config_t cfg;
    memset(&cfg, 0, sizeof(cfg));
    cfg.broker.address.hostname = g_broker_host;
    cfg.broker.address.port = g_broker_port;
    cfg.broker.address.transport = MQTT_TRANSPORT_OVER_TCP;
    cfg.credentials.client_id = g_device_id;
    g_mqtt_client = esp_mqtt_client_init(&cfg);
    if(g_mqtt_client){
        esp_mqtt_client_register_event(g_mqtt_client, MQTT_EVENT_ANY, mqtt_event_handler, NULL);
    }
    return g_mqtt_client ? ESP_OK : ESP_FAIL;
}

void mqtt_client_start(void)
{
    if (g_mqtt_client) esp_mqtt_client_start(g_mqtt_client);
}

void mqtt_client_stop(void)
{
    if (g_mqtt_client) {
        esp_mqtt_client_stop(g_mqtt_client);
        esp_mqtt_client_destroy(g_mqtt_client);
        g_mqtt_client = NULL;
    }
}

esp_err_t mqtt_publish_upload_json(cJSON *upload_obj)
{
    if (!g_mqtt_client || !upload_obj) return ESP_ERR_INVALID_ARG;
    char *payload = cJSON_PrintUnformatted(upload_obj);
    if (!payload) return ESP_ERR_NO_MEM;
    int msgid = esp_mqtt_client_publish(g_mqtt_client, TOPIC_UPLOAD, payload, 0, 1, 0); // QoS=1
    free(payload);
    return msgid >= 0 ? ESP_OK : ESP_FAIL;
}

esp_err_t mqtt_publish_status_json(cJSON *status_obj)
{
    if (!g_mqtt_client || !status_obj) return ESP_ERR_INVALID_ARG;
    char *payload = cJSON_PrintUnformatted(status_obj);
    if (!payload) return ESP_ERR_NO_MEM;
    int msgid = esp_mqtt_client_publish(g_mqtt_client, TOPIC_STATUS, payload, 0, 1, 0); // QoS=1
    free(payload);
    return msgid >= 0 ? ESP_OK : ESP_FAIL;
}