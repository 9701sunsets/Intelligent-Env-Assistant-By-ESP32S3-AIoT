#ifndef MQ2_H
#define MQ2_H

#include "esp_err.h"
#include <stdbool.h>

esp_err_t mq2_init(void);
void mq2_task_start(void);

int mq2_read_raw(void);          // 原始 ADC 值
float mq2_read_voltage(void);    // 电压 (V)
float mq2_read_ppm(void);        // 估算 ppm（若未标定返回 -1）
bool mq2_get_alarm(void);        // DO 状态（经过去抖/限流）

esp_err_t mq2_set_threshold_raw(int raw);
int mq2_get_threshold_raw(void);

#endif // MQ2_H