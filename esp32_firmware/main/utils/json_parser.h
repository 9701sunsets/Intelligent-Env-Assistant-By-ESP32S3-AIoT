#ifndef __JSON_PARSER_H__
#define __JSON_PARSER_H__

#include "cJSON.h"
#include <stdint.h>

cJSON *json_create_upload(const char *device_id, double temperature, double humidity,
                          int light, const char *comfort, int wifi_rssi, const char *timestamp,
                          double mq2_ppm, int mq2_alarm);

cJSON *json_create_status(const char *device_id, const char *status, const char *ip,
                          const char *firmware_version, uint32_t free_heap, const char *timestamp);

/* 解析控制消息，返回 0=ok, -1=error. 若目标为 led，则填充 color/state/value（buffer/ints） */
int json_parse_control_led(const char *payload, size_t len,
                           char *out_msg_id, size_t msg_id_len,
                           char *out_state, size_t state_len,
                           char *out_color, size_t color_len,
                           int *out_value);

#endif // __JSON_PARSER_H__