#ifndef _LIGHT_SENSOR_H_
#define _LIGHT_SENSOR_H_

#include "driver/gpio.h"
#include "driver/adc.h"

void init_light_sensor(void);
int read_light_raw(void);
float read_light_voltage(void);

#endif // _LIGHT_SENSOR_H_