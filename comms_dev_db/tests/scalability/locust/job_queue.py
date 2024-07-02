import redis, json


class JobQueue:
    queue_name = "comms_queue"
    redis = None

    def __init__(self, hostname="localhost"):
        if self.redis is None:
            print(f"Connecting to redis {hostname}")
            self.redis = redis.Redis(host=hostname, port=6379)

    def clear(self):
        self.redis.delete(self.queue_name)

    def push(self, data):
        print("PUSH data ", data)
        self.redis.lpush(self.queue_name, json.dumps(data))

    def pop(self):
        data = self.redis.rpop(self.queue_name)
        if data:
            return json.loads(data)

    def list(self):
        pass
