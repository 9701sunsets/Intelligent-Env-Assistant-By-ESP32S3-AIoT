#ifndef __LED_H
#define __LED_H
 
#include"driver/gpio.h"
#include"led_strip.h"

extern led_strip_handle_t led_strip;//灯带句柄
extern const char *TAG;

void configure_led(void);

#endif // __LED_H