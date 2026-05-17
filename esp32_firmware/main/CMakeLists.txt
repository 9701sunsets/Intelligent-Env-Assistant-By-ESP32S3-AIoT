idf_component_register(SRCS "wifi_manager.c" "main.c"
                       PRIV_REQUIRES spi_flash
                       PRIV_REQUIRES led
                       PRIV_REQUIRES esp_wifi
                       PRIV_REQUIRES nvs_flash
                       PRIV_REQUIRES esp_event
                       PRIV_REQUIRES esp_netif
                       INCLUDE_DIRS "")
