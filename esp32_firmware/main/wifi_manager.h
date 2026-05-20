#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <esp_err.h>
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"

esp_err_t wifi_manager_init(void);
void wifi_manager_start_smartconfig(void);
void wifi_manager_start_softap(void);
void wifi_manager_scan(void);
EventGroupHandle_t wifi_manager_get_event_group(void);

#endif // WIFI_MANAGER_H