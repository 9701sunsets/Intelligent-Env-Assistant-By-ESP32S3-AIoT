#include "stdio.h"
#include "dht11.h"
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <driver/gpio.h>
#include "soc/adc_channel.h"
#include <esp_err.h>
#include "esp_rom_sys.h"

// 定义DHT11传感器连接的GPIO引脚
#define DHT11_PIN GPIO_NUM_1

static void line_low() { gpio_set_direction(DHT11_PIN, GPIO_MODE_OUTPUT); gpio_set_level(DHT11_PIN, 0); }
static void line_high_input() { gpio_set_direction(DHT11_PIN, GPIO_MODE_INPUT); }

esp_err_t dht11_init(gpio_num_t pin)
{
    gpio_reset_pin(pin);
    gpio_set_direction(pin, GPIO_MODE_INPUT);
    return ESP_OK;
}

esp_err_t dht11_read(gpio_num_t pin, int *temperature, int *humidity)
{
    uint8_t data[5] = {0};
    // 启动信号
    line_low();
    esp_rom_delay_us(18000); // >18ms
    line_high_input();
    esp_rom_delay_us(40);

    // 等待应答：主机拉高后 DHT 拉低 ~80us，再拉高 ~80us
    int timeout = 0;
    while (gpio_get_level(DHT11_PIN) == 1) { if (++timeout > 1000) return ESP_ERR_TIMEOUT; }
    timeout = 0;
    while (gpio_get_level(DHT11_PIN) == 0) { if (++timeout > 1000) return ESP_ERR_TIMEOUT; }
    timeout = 0;
    while (gpio_get_level(DHT11_PIN) == 1) { if (++timeout > 1000) return ESP_ERR_TIMEOUT; }

    // 读 40 位
    for (int i = 0; i < 40; i++) {
        // 先等低电平（start），再测高电平时长
        timeout = 0; while (gpio_get_level(DHT11_PIN) == 0) { if (++timeout > 1000) return ESP_ERR_TIMEOUT; }
        // 高电平开始，计时长度决定 0/1
        esp_rom_delay_us(35);
        if (gpio_get_level(DHT11_PIN) == 1) {
            data[i/8] <<= 1;
            data[i/8] |= 1;
            // 等到高电平结束
            timeout = 0; while (gpio_get_level(DHT11_PIN) == 1) { if (++timeout > 1000) break; }
        } else {
            data[i/8] <<= 1;
        }
    }

    // 校验和
    if (data[4] != ((data[0] + data[1] + data[2] + data[3]) & 0xFF)) return ESP_ERR_INVALID_CRC;

    *humidity = data[0];
    *temperature = data[2];
    return ESP_OK;
}