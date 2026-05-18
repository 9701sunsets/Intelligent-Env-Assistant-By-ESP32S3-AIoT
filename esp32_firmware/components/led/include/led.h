#ifndef __LED_H
#define __LED_H

#include <stdint.h>
#include "driver/gpio.h"
#include "led_strip.h"

// 定义LED效果类型
typedef enum {
    LED_EFFECT_NONE = 0,
    LED_EFFECT_BLINK,
} led_effect_type_t;

// 定义LED效果结构体
typedef struct {
    led_effect_type_t type;
    uint8_t r, g, b;    // LED颜色
    uint32_t period_ms; // 闪烁周期，单位毫秒
    uint32_t repeat;    // 闪烁次数，0表示无限循环
} effect_t;

extern led_strip_handle_t led_strip;//灯带句柄
extern const char *TAG;

void led_init(void);
void led_set_rgb(uint8_t r, uint8_t g, uint8_t b);
void led_set_effect(effect_t *effect); // 异步运行effect，调用后立即返回
void led_set_color_enum(int color_id);
void led_off(void);

#endif // __LED_H