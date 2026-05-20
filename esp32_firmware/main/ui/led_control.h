#ifndef __LED_CONTROL_H
#define __LED_CONTROL_H

#include <stdint.h>
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"

void led_control_init(void);
void led_display_wifi_connecting(void);
void led_display_wifi_connected(void);
void led_display_error(void);
void led_display_off(void);

#endif // __LED_CONTROL_H