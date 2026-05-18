#include "stdio.h"
#include "light_sensor.h"
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <driver/gpio.h>
#include <driver/adc.h>
#include <esp_err.h>

// 定义光照传感器连接的GPIO引脚
#define LIGHT_ADC_CHANNEL ADC1_CHANNEL_4 // GPIO_NUM_5
#define LIGHT_DO_PIN ADC1_CHANNEL_3 // GPIO_NUM_4
#define ADC_ATTEN ADC_ATTEN_DB_11
#define ADC_WIDTH ADC_WIDTH_BIT_12
#define ADC_MAX ((1 << 12) - 1) // 12位ADC的最大值
#define VREF 3.3f

// 初始化 ADC 光敏
void init_light_sensor(void) 
{
    // 配置 ADC 引脚
    adc1_config_width(ADC_WIDTH); // 设置 ADC 分辨率为 12 位
    adc1_config_channel_atten(LIGHT_ADC_CHANNEL, ADC_ATTEN); // 设置 ADC 输入衰减为 11dB，适用于 0-3.3V 的输入范围
}

// 读取光照传感器的原始 ADC 值
int read_light_raw(void) 
{
    return adc1_get_raw(LIGHT_ADC_CHANNEL);
}

// 读取光照传感器的电压值
float read_light_voltage(void) 
{
    int raw = read_light_raw();
    return ((float)raw / ADC_MAX) * VREF; // 将原始值转换为电压值
}