# Dart backend — FastAPI. Deploys to any container host (Fly.io, Render, Railway).
FROM python:3.12-slim

WORKDIR /app

# ffmpeg: used to losslessly re-tag Safari's sRGB-tagged videos to BT.709 on save
# (a stream copy, no re-encode). The app degrades gracefully if it's absent.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install deps first for layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Render/Fly inject $PORT; default to 8000 for local `docker run`.
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
