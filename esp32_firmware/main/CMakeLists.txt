idf_component_register(
    SRCS 
        "main.c" 
        "wifi_manager.c"
        "sensor/light_sensor.c"
        "sensor/dht11.c"
        "ui/led_control.c"

    PRIV_REQUIRES 
        spi_flash
        led
        esp_wifi
        nvs_flash
        esp_event
        esp_netif
    INCLUDE_DIRS "."
)
