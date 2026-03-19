import socketio
import time

URL = "http://127.0.0.1:5000"

sio = socketio.Client()
responses = []

@sio.event
def connect():
    print("Connected to backend.")

@sio.on("recv_message")
def on_recv_message(data):
    print("Response:", data)
    responses.append(data)

@sio.event
def connect_error(err):
    print("Connect error:", err)

@sio.event
def disconnect():
    print("Disconnected from backend.")

def main():
    sio.connect(URL, transports=["polling", "websocket"])
    samples = [
        ("en", "Hello"),
        ("hi", "फसल बीमा क्या है?"),
        ("kn", "ನನ್ನ ಪ್ರದೇಶಕ್ಕೆ ಯಾವ ಬೆಳೆ ಸೂಕ್ತ?"),
        ("te", "నా ప్రాంతంలో ఏ పంటలు సరి?"),
        ("ml", "എന്റെ പ്രദേശത്ത് ഏത് വിളകൾ നല്ലത്?"),
        ("ta", "என் பகுதிக்கு ஏது பயிர் பொருத்தம்?"),
    ]
    for lang, msg in samples:
        print(f"\nSending ({lang}): {msg}")
        sio.emit("message", {"message": msg, "language": lang})
        t0 = time.time()
        # wait up to 5 seconds for a response
        while len(responses) < samples.index((lang, msg)) + 1 and time.time() - t0 < 5:
            time.sleep(0.1)
    sio.disconnect()

if __name__ == "__main__":
    main()
