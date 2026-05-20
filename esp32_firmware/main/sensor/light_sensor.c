#include "stdio.h"
#include "light_sensor.h"
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <driver/gpio.h>
#include "esp_adc/adc_oneshot.h"
#include "soc/adc_channel.h"
#include <esp_err.h>

static adc_oneshot_unit_handle_t adc_handle = NULL;

// 定义光照传感器连接的GPIO引脚
#define ADC_UNIT_ID       ADC_UNIT_1
#define ADC_CH            ADC_CHANNEL_4    // 对应 ADC1 通道，根据硬件调整
#define ADC_ATTEN         ADC_ATTEN_DB_12
#define ADC_BIT_WIDTH     ADC_BITWIDTH_DEFAULT
#define ADC_MAX           ((1 << 12) - 1)
#define VREF              3.3f

// 初始化 ADC 光敏
void init_light_sensor(void)
{
    adc_oneshot_unit_init_cfg_t init_cfg = {
        .unit_id = ADC_UNIT_1,
        .ulp_mode = false
    };
    adc_oneshot_new_unit(&init_cfg, &adc_handle);

    adc_oneshot_chan_cfg_t chan_cfg = {
        .bitwidth = ADC_BITWIDTH_DEFAULT,
        .atten = ADC_ATTEN
    };
    adc_oneshot_config_channel(adc_handle, ADC_CHANNEL_4, &chan_cfg);
}

// 读取光照传感器的原始 ADC 值
int read_light_raw(void)
{
    int raw = 0;
    adc_oneshot_read(adc_handle, ADC_CHANNEL_4, &raw);
    return raw;
}

// 读取光照传感器的电压值
float read_light_voltage(void)
{
    int raw = read_light_raw();
    return ((float)raw / ADC_MAX) * VREF;
}