#include "adc_manager.h"
#include "esp_log.h"
#include "hal/adc_types.h"

static const char *TAG = "adc_manager";
static adc_oneshot_unit_handle_t s_adc_handle = NULL;

esp_err_t adc_manager_init(void)
{
    if (s_adc_handle) return ESP_OK;
    adc_oneshot_unit_init_cfg_t init_cfg = {
        .unit_id = ADC_UNIT_1,
        .ulp_mode = ADC_ULP_MODE_DISABLE,
    };
    esp_err_t ret = adc_oneshot_new_unit(&init_cfg, &s_adc_handle);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "adc_oneshot_new_unit failed: %s", esp_err_to_name(ret));
        s_adc_handle = NULL;
        return ret;
    }
    ESP_LOGI(TAG, "ADC oneshot unit inited");
    return ESP_OK;
}

adc_oneshot_unit_handle_t adc_manager_get_handle(void)
{
    return s_adc_handle;
}