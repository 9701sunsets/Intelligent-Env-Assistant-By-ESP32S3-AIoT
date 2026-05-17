idf_component_register(SRCS "hello_world_main.c"
                       PRIV_REQUIRES spi_flash
                       PRIV_REQUIRES led
                       PRIV_REQUIRES esp_wifi
                       PRIV_REQUIRES nvs_flash
                       PRIV_REQUIRES esp_event
                       PRIV_REQUIRES esp_netif
                       # PRIV_REQUIRES esp_wpa2
                       INCLUDE_DIRS "")
