#include "led_control.h"
#include "led.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"

static const char *TAG = "led_control";

//* 连接状态标志，2表示连接成功，1表示连接失败，其他值表示正在连接 */
typedef enum {
    LCD_CMD_WIFI_CONNECTING,
    LCD_CMD_WIFI_CONNECTED,
    LCD_CMD_ERROR,
    LCD_CMD_OFF,
} lcd_cmd_t;

//* LCD消息结构体 */
typedef struct {
    lcd_cmd_t cmd;
} lcd_msg_t;

static QueueHandle_t s_lcd_queue; // LCD消息队列句柄
static TaskHandle_t s_lcd_task; // LCD任务句柄

static void lcd_task_fn(void *arg)
{
    lcd_msg_t msg;
    while (1)
    {
        if (xQueueReceive(s_lcd_queue, &msg, portMAX_DELAY) == pdTRUE)
        {
            switch (msg.cmd)
            {
                case LCD_CMD_WIFI_CONNECTING: {
                    effect_t eff = {
                        .type = LED_EFFECT_BLINK,
                        .r = 255, .g = 255, .b = 0, // 黄色
                        .period_ms = 800,
                        .repeat = 0, // 无限循环
                    };
                    led_set_effect(&eff);
                    ESP_LOGI(TAG, "LED: Connecting to Wi-Fi...");
                    break;
                }
                case LCD_CMD_WIFI_CONNECTED: {
                    led_set_rgb(0, 0, 255); // 蓝色
                    ESP_LOGI(TAG, "LED: Connected to Wi-Fi");
                    break;
                }
                case LCD_CMD_ERROR: {
                    effect_t eff = {
                        .type = LED_EFFECT_BLINK,
                        .r = 255, .g = 0, .b = 0, // 红色
                        .period_ms = 500,
                        .repeat = 0, // 无限循环
                    };
                    led_set_effect(&eff);
                    ESP_LOGI(TAG, "LED: Error occurred");
                    break;
                }
                case LCD_CMD_OFF:
                default: {
                    ESP_LOGI(TAG, "LED: Off");
                    led_off(); // 默认关闭LED
                    break;
                }
            }
        }
    }
}

void led_control_init(void)
{
    if(s_lcd_queue) return; // 已经初始化过了
    // 创建LCD消息队列
    s_lcd_queue = xQueueCreate(4, sizeof(lcd_msg_t));
    // 创建LCD任务
    xTaskCreate(lcd_task_fn, "led_control_task", 3072, NULL, 6, &s_lcd_task);
}

static void send_lcd_cmd(lcd_cmd_t cmd)
{
    if (s_lcd_queue)
    {
        lcd_msg_t msg = { .cmd = cmd };
        xQueueSend(s_lcd_queue, &msg, portMAX_DELAY); // 发送命令到LCD任务
    }
}

void led_display_wifi_connecting(void) { send_lcd_cmd(LCD_CMD_WIFI_CONNECTING); }
void led_display_wifi_connected(void)  { send_lcd_cmd(LCD_CMD_WIFI_CONNECTED); }
void led_display_error(void)           { send_lcd_cmd(LCD_CMD_ERROR); }
void led_display_off(void)             { send_lcd_cmd(LCD_CMD_OFF); } 

// /**
//  * @brief 根据Wi-Fi连接状态设置LED颜色的函数
//  * @param flag 连接状态标志，2表示连接成功，1表示连接失败，其他值表示正在连接
//  */
// void connect_display(uint8_t flag)
// {
//     if(flag == 2)
//     {
//         ESP_LOGI(TAG, "Connected to Wi-Fi, setting LED color to BLUE");
//         led_strip_set_pixel(led_strip, 0, 0, 0, 255); // 设置为蓝色
//         led_strip_refresh(led_strip);                 // 刷新灯带使颜色生效
//     }
//     else if(flag == 1)
//     {
//         ESP_LOGI(TAG, "Failed to connect to Wi-Fi, setting LED color to RED");
//         led_strip_set_pixel(led_strip, 0, 255, 0, 0); // 设置为红色
//         led_strip_refresh(led_strip);                 // 刷新灯带使颜色生效
//     }
//     else
//     {
//         ESP_LOGI(TAG, "Connecting to Wi-Fi, setting LED color to YELLOW");
//         led_strip_set_pixel(led_strip, 0, 255, 255, 0); // 设置为黄色
//         led_strip_refresh(led_strip);                   // 刷新灯带使颜色生效
//     }
// }