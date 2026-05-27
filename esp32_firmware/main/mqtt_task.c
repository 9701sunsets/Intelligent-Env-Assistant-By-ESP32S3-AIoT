#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_sntp.h"
#include "esp_wifi.h"
#include "cloud/mqtt_clients.h"
#include "utils/json_parser.h"
#include "ai/comfort_ai.h"
#include "sensor/dht11.h"
#include "sensor/light_sensor.h"
#include "sensor/mq2.h"
#include "wifi_manager.h"
#include <time.h>
#include <lwip/inet.h>

static const char *TAG = "mqtt_task";

static const char *broker_host = "192.168.57.159";
static const int broker_port = 1883;

static void initialize_sntp(void)
{
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "pool.ntp.org");
    esp_sntp_init();
    setenv("TZ", "CST-8", 1); // 设置时区为中国标准时间
    tzset();
    // 不阻塞太久，这里只是触发同步，mqtt 时间戳若为空也可接受
}

static char *get_iso_ts(char *buf, size_t len)
{
    time_t now = time(NULL);
    struct tm tm;
    if (localtime_r(&now, &tm) == NULL) {
        buf[0] = '\0';
        return buf;
    }
    strftime(buf, len, "%Y-%m-%dT%H:%M:%Sz", &tm);
    return buf;
}

void mqtt_main_task(void *arg)
{
    EventGroupHandle_t eg = wifi_manager_get_event_group();
    const int CONNECTED_BIT = BIT0;
    xEventGroupWaitBits(eg, CONNECTED_BIT, pdFALSE, pdFALSE, portMAX_DELAY);

    initialize_sntp();

    mqtt_client_init_with_broker(broker_host, broker_port, "esp32_001");
    mqtt_client_start();

    dht11_init(GPIO_NUM_1);
    init_light_sensor();
    mq2_init();
    mq2_task_start();

    while (1) {
        // 读取传感器数据
        int temp=0, hum=0;
        dht11_read(GPIO_NUM_1, &temp, &hum);
        int light = read_light_raw();

        int mq2_raw = mq2_read_raw();
        double mq2_v = mq2_read_voltage();
        double mq2_ppm = mq2_read_ppm();
        int mq2_alarm = mq2_get_alarm() ? 1 : 0;

        // 获取 RSSI
        int wifi_rssi = -127;
        wifi_ap_record_t ap_info;
        if (esp_wifi_sta_get_ap_info(&ap_info) == ESP_OK) {
            wifi_rssi = ap_info.rssi;
        }

        // 计算舒适度
        const char *comfort = comfort_ai_evaluate((float)temp, (float)hum, light);

        // 时间戳
        char ts[64]; get_iso_ts(ts, sizeof(ts));

        ESP_LOGI(TAG, "Sensor reading - Temp=%dC Hum=%d%% Light=%d Comfort=%s RSSI=%ddBm", temp, hum, light, comfort, wifi_rssi);

        // 创建并发布
        cJSON *up = json_create_upload("esp32_001", (double)temp, (double)hum, light, comfort, wifi_rssi, ts,
                                      mq2_raw, mq2_v, mq2_ppm, mq2_alarm);
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

        vTaskDelay(pdMS_TO_TICKS(2000)); // 2s
    }
}