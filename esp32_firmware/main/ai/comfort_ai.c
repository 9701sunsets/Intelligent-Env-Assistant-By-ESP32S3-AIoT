#include "comfort_ai.h"

/*
 简单规则：
 - 当温度在 22-26 且湿度在 30-60 时 -> "comfortable"
 - 温度 < 18 -> "cold"
 - 温度 > 30 -> "hot"
 - 湿度 > 70 -> "humid"
 - 湿度 < 25 -> "dry"
 - 光照 > 800 -> "bright"
 - 光照 < 100 -> "dim"
 - 否则 -> "neutral"
*/
const char *comfort_ai_evaluate(float temperature, float humidity, int light)
{
    if (temperature >= 22.0f && temperature <= 26.0f && humidity >= 30.0f && humidity <= 60.0f) {
        return "comfortable";
    }
    if (temperature < 18.0f) {
        return "cold";
    }
    if (temperature > 30.0f) {
        return "hot";
    }
    if (humidity > 70.0f) {
        return "humid";
    }
    if (humidity < 25.0f) {
        return "dry";
    }
    if (light > 800) {
        return "bright";
    }
    if (light < 100) {
        return "dim";
    }
    return "neutral";
}