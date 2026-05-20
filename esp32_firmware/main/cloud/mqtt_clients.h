#ifndef __MQTT_CLIENT_H__
#define __MQTT_CLIENT_H__

#include "esp_err.h"
#include "cJSON.h"

// 初始化 MQTT：按主机/端口/设备 id 初始化（适配 mqtt 客户端实现）
esp_err_t mqtt_client_init_with_broker(const char *broker_host, int broker_port, const char *device_id);

esp_err_t mqtt_client_init(const char *broker_uri, const char *device_id);

void mqtt_client_start(void);
void mqtt_client_stop(void);

/* JSON 发布接口（使用 QoS=1） */
esp_err_t mqtt_publish_upload_json(cJSON *json_data);
esp_err_t mqtt_publish_status_json(cJSON *json_data);

#endif // __MQTT_CLIENT_H__