FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir piper-tts==1.8.0
WORKDIR /app
COPY tts/worker.py tts/profile.json ./
# Volumes must be writable by the unprivileged worker on their first creation.
RUN mkdir /audio /models && chown -R 10001:10001 /audio /models
USER 10001:10001
ENV OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
ENTRYPOINT ["python", "worker.py"]
CMD ["watch"]
