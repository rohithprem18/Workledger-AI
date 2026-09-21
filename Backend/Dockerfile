# ---------- build ----------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Dependencies resolve in their own layer, so a code change does not re-download
# the world on every rebuild.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q clean package -DskipTests

# ---------- run ----------
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Unprivileged user: nothing this process does needs root.
RUN addgroup -S app && adduser -S -G app app

COPY --from=build /build/target/*.jar app.jar
RUN chown app:app /app/app.jar
USER app

EXPOSE 8080

ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC"

# MaxRAMPercentage rather than a fixed -Xmx so the JVM sizes itself to whatever
# the free tier actually grants the container.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
