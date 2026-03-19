""" This file contains the code for the chatbot response. """

# Importing the required libraries and model
import nltk
import pickle
import numpy as np
import json
import random
from nltk.stem import WordNetLemmatizer
from keras.models import load_model
try:
    from googletrans import Translator  # Import Translator from googletrans module
except Exception:  # pragma: no cover
    Translator = None
from flask import Flask, jsonify
from flask_socketio import SocketIO, emit

lemma = WordNetLemmatizer()
model = load_model('model.h5')
intents = json.loads(open('intents.json').read())
words = pickle.load(open('word.pkl','rb'))
classes = pickle.load(open('class.pkl','rb'))

# Function to clean up the sentence
def clean_up_sentence(sentence):
    try:
        sentence_words = nltk.word_tokenize(sentence)
    except LookupError:
        try:
            nltk.download('punkt', quiet=True)
            sentence_words = nltk.word_tokenize(sentence)
        except Exception:
            sentence_words = sentence.split()
    try:
        sentence_words = [lemma.lemmatize(word.lower()) for word in sentence_words]
    except LookupError:
        try:
            nltk.download('wordnet', quiet=True)
            sentence_words = [lemma.lemmatize(word.lower()) for word in sentence_words]
        except Exception:
            sentence_words = [word.lower() for word in sentence_words]
    return sentence_words

# Function to create the bag of words
def bow(sentence, words, show_details=True):
    sentence_words = clean_up_sentence(sentence)
    cltn = np.zeros(len(words), dtype=np.float32)
    for word in sentence_words:
        for i, w in enumerate(words):
            if w == word:
                cltn[i] = 1
                if show_details:
                    print(f"Found '{w}' in bag")
    return cltn

# Function to predict the class
def predict_class(sentence, model):
    l = bow(sentence, words, show_details=False)
    res = model.predict(np.array([l]))[0]

    ERROR_THRESHOLD = 0.25
    results = [(i, j) for i, j in enumerate(res) if j > ERROR_THRESHOLD]
    results.sort(key=lambda x: x[1], reverse=True)
    return_list = [{"intent": classes[k[0]], "probability": str(k[1])} for k in results]
    return return_list

# Function to get the response
def getResponse(ints, intents_json):
    if not ints:
        return "I'm not sure I understood that."
    tag = ints[0]['intent']
    for i in intents_json['intents']:
        if i['tag'] == tag:
            return random.choice(i['responses']) 

# Function to translate messages
def translate_message(message, source_language, target_language='en'):
    try:
        if not Translator:
            return message if source_language == target_language else message
        translator = Translator()
        translated_message = translator.translate(message, src=source_language, dest=target_language).text
        return translated_message
    except Exception:
        return message

def detect_language(message):
    try:
        if not Translator:
            return 'en'
        translator = Translator()
        return translator.detect(message).lang or 'en'
    except Exception:
        return 'en'

# Function to get the chatbot response 
def chatbotResponse(msg, target_language):
    try:
        src = detect_language(msg)
        translated_msg = translate_message(msg, src, 'en')
        ints = predict_class(translated_msg, model)
        res = getResponse(ints, intents)
        translated_response = translate_message(res, 'en', target_language)
        return translated_response
    except Exception:
        return "Sorry, something went wrong while processing your request."

# Creating the flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
app.static_folder = 'static'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

# Creating the socket connection
@socketio.on('message')
def handle_message(data):
    target_language = data.get('language', 'en')
    response = chatbotResponse(data.get('message', ''), target_language)
    print(response)
    emit('recv_message', response)

# Running the app
if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=5000, debug=True, allow_unsafe_werkzeug=True)
