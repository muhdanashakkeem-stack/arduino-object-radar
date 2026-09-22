#include <Servo.h>

#define TRIG_PIN 9
#define ECHO_PIN 10
#define SERVO_PIN 6

Servo radarServo;

float getDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    return 400;
  }

  float distance = duration * 0.0343 / 2.0;

  if (distance < 0) {
    distance = 0;
  }

  return distance;
}

void setup() {
  Serial.begin(9600);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  radarServo.attach(SERVO_PIN);
  radarServo.write(0);

  delay(500);
}

void loop() {
  // 0° -> 180°
  for (int angle = 0; angle <= 180; angle++) {
    radarServo.write(angle);
    delay(25);

    float distance = getDistance();

    Serial.print(angle);
    Serial.print(",");
    Serial.println(distance);

    delay(15);
  }

  // 180° -> 0°
  for (int angle = 180; angle >= 0; angle--) {
    radarServo.write(angle);
    delay(25);

    float distance = getDistance();

    Serial.print(angle);
    Serial.print(",");
    Serial.println(distance);

    delay(15);
  }
}
