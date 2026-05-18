#ifndef _DHT11_H_
#define _DHT11_H_

#include "driver/gpio.h"
#include "driver/adc.h"

esp_err_t dht11_init(gpio_num_t pin);
esp_err_t dht11_read(gpio_num_t pin, float *temperature, float *humidity);

#endif // _DHT11_H_