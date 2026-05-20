#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_sntp.h"
#include "mqtt_client.h"
#include "json_parser.h"
#include "sensor/dht11.h"
#include "sensor/light_sensor.h"
#include "wifi_manager.h"
#include <time.h>
#include <lwip/inet.h>

static const char *TAG = "mqtt_task";

static void initialize_sntp(void)
{
    sntp_setoperatingmode(SNTP_OPMODE_POLL);
    sntp_setservername(0, "pool.ntp.org");
    sntp_init();
    // 不阻塞太久，这里只是触发同步，mqtt 时间戳若为空也可接受
}

static char *get_iso_ts(char *buf, size_t len)
{
    time_t now = time(NULL);
    struct tm tm;
    if (gmtime_r(&now, &tm) == NULL) {
        buf[0] = '\0';
        return buf;
    }
    strftime(buf, len, "%Y-%m-%dT%H:%M:%SZ", &tm);
    return buf;
}

void mqtt_main_task(void *arg)
{
    EventGroupHandle_t eg = wifi_manager_get_event_group();
    const int CONNECTED_BIT = BIT0;
    xEventGroupWaitBits(eg, CONNECTED_BIT, pdFALSE, pdFALSE, portMAX_DELAY);

    initialize_sntp();

    mqtt_client_init_with_broker("192.168.1.100", 1883, "esp32_001");
    mqtt_client_start();

    dht11_init(GPIO_NUM_1);
    init_light_sensor();

    while (1) {
        int temp=0, hum=0;
        dht11_read(GPIO_NUM_1, &temp, &hum);
        int light = read_light_raw();
        char ts[64]; get_iso_ts(ts, sizeof(ts));
        cJSON *up = json_create_upload("esp32_001", (double)temp, (double)hum, light, "comfortable", -48, ts);
        mqtt_publish_upload_json(up);
        cJSON_Delete(up);

        // publish status
        char ipbuf[32] = {0};
        esp_netif_ip_info_t ip_info;
        if (esp_netif_get_ip_info(esp_netif_get_handle_from_ifkey("WIFI_STA_DEF"), &ip_info) == ESP_OK) {
            inet_ntoa_r(ip_info.ip.addr, ipbuf, sizeof(ipbuf));
        }
        cJSON *st = json_create_status("esp32_001", "online", ipbuf, "1.0.0", esp_get_free_heap_size(), ts);
        mqtt_publish_status_json(st);
        cJSON_Delete(st);

        vTaskDelay(pdMS_TO_TICKS(15000)); // 15s
    }
}