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
    INCLUDE_DIRS "."
)
