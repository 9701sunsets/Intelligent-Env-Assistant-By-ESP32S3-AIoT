#ifndef _LIGHT_SENSOR_H_
#define _LIGHT_SENSOR_H_

#include "driver/gpio.h"
#include "soc/adc_channel.h"
#include "esp_err.h"

void init_light_sensor(void);
int read_light_raw(void);
float read_light_voltage(void);

#endif // _LIGHT_SENSOR_H_