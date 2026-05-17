idf_component_register(SRCS "led.c"
                    INCLUDE_DIRS "include"
                    # 添加官方gpio组件
                    REQUIRES esp_driver_gpio
                    # 添加官方led_strip组件
                    REQUIRES led_strip
                    )
