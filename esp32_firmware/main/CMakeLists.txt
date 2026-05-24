# normalize IDF_PATH to forward-slash form for Windows
if(DEFINED ENV{IDF_PATH})
    file(TO_CMAKE_PATH "$ENV{IDF_PATH}" IDF_PATH_CMAKE)
else()
    set(IDF_PATH_CMAKE "")
endif()

set(MBEDTLS_PRIVATE_INCLUDE "${IDF_PATH_CMAKE}/components/mbedtls/mbedtls/tf-psa-crypto/drivers/builtin/include")

idf_component_register(
    SRCS 
        "main.c" 
        "wifi_manager.c"
        "mqtt_task.c"
        "sensor/light_sensor.c"
        "sensor/dht11.c"
        "ui/led_control.c"
        "cloud/mqtt_clients.c"
        "utils/json_parser.c"
        "ai/comfort_ai.c"
        "ota/ota_update.c"

    PRIV_REQUIRES 
        spi_flash
        led
        esp_wifi
        nvs_flash
        esp_event
        esp_netif
        esp_adc
        mqtt
        cjson
        esp_http_server
        esp_http_client
        esp_https_ota
        bootloader_support
        mbedtls
        app_update
    INCLUDE_DIRS
        "."
        "${MBEDTLS_PRIVATE_INCLUDE}"
)
