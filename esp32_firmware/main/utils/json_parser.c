#include "json_parser.h"
#include "cJSON.h"
#include <string.h>
#include <stdio.h>

cJSON *json_create_upload(const char *device_id, double temperature, double humidity,
                          int light, const char *comfort, int wifi_rssi, const char *timestamp)
{
    cJSON *root = cJSON_CreateObject();
    if (!root) return NULL;
    cJSON_AddStringToObject(root, "device_id", device_id);
    cJSON_AddNumberToObject(root, "temperature", temperature);
    cJSON_AddNumberToObject(root, "humidity", humidity);
    cJSON_AddNumberToObject(root, "light", light);
    cJSON_AddStringToObject(root, "comfort", comfort ? comfort : "");
    cJSON_AddNumberToObject(root, "wifi_rssi", wifi_rssi);
    cJSON_AddStringToObject(root, "timestamp", timestamp ? timestamp : "");
    return root;
}

cJSON *json_create_status(const char *device_id, const char *status, const char *ip,
                          const char *firmware_version, uint32_t free_heap, const char *timestamp)
{
    cJSON *root = cJSON_CreateObject();
    if (!root) return NULL;
    cJSON_AddStringToObject(root, "device_id", device_id);
    cJSON_AddStringToObject(root, "status", status ? status : "");
    cJSON_AddStringToObject(root, "ip", ip ? ip : "");
    cJSON_AddStringToObject(root, "firmware_version", firmware_version ? firmware_version : "");
    cJSON_AddNumberToObject(root, "free_heap", (double)free_heap);
    cJSON_AddStringToObject(root, "timestamp", timestamp ? timestamp : "");
    return root;
}

// 解析控制消息，返回 0=ok, -1=error. 若目标为 led，则填充 color/state/value（buffer/ints）
int json_parse_control_led(const char *payload, size_t len,
                           char *out_msg_id, size_t msg_id_len,
                           char *out_state, size_t state_len,
                           char *out_color, size_t color_len,
                           int *out_value)
{
    if (!payload) return -1;
    cJSON *root = cJSON_ParseWithLength(payload, len);
    if (!root) return -1;

    cJSON *msg_id = cJSON_GetObjectItem(root, "msg_id");
    cJSON *target = cJSON_GetObjectItem(root, "target");
    cJSON *action = cJSON_GetObjectItem(root, "action");

    if (!cJSON_IsString(msg_id) || !cJSON_IsString(target) || !cJSON_IsObject(action)) {
        cJSON_Delete(root);
        return -1;
    }

    if (out_msg_id && cJSON_IsString(msg_id)) {
        strncpy(out_msg_id, msg_id->valuestring, msg_id_len-1);
        out_msg_id[msg_id_len-1] = '\0';
    }
    if (strcmp(target->valuestring, "led") != 0) {
        cJSON_Delete(root);
        return -1;
    }

    cJSON *state = cJSON_GetObjectItem(action, "state");
    cJSON *color = cJSON_GetObjectItem(action, "color");
    cJSON *value = cJSON_GetObjectItem(action, "value");

    if (state && cJSON_IsString(state) && out_state) {
        strncpy(out_state, state->valuestring, state_len-1);
        out_state[state_len-1] = '\0';
    }
    if (color && cJSON_IsString(color) && out_color) {
        strncpy(out_color, color->valuestring, color_len-1);
        out_color[color_len-1] = '\0';
    }
    if (value && cJSON_IsNumber(value) && out_value) {
        *out_value = value->valueint;
    }

    cJSON_Delete(root);
    return 0;
}