#ifndef _DHT11_H_
#define _DHT11_H_

#include "driver/gpio.h"
#include "soc/adc_channel.h"
#include "esp_err.h"

esp_err_t dht11_init(gpio_num_t pin);
esp_err_t dht11_read(gpio_num_t pin, int *temperature, int *humidity);

#endif // _DHT11_H_