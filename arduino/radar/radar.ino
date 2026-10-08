const int trigPin = 2;
const int echoPin = 3;

void setup() {
  Serial.begin(9600);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
}

void loop() {
  // Clear trigger
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);

  // Send 10us pulse
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  // Read echo time (timeout 30000us = ~5 meters)
  long duration = pulseIn(echoPin, HIGH, 30000);

  // Convert to cm
  int distance = duration * 0.0343 / 2;

  Serial.print("Echo duration: ");
  Serial.print(duration);
  Serial.print(" us | Distance: ");
  Serial.print(distance);
  Serial.println(" cm");

  delay(250);
}
