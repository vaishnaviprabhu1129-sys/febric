import React, { useState, useEffect, useRef, useMemo } from 'react';
import send_svg from './assets/send.svg';
import mic_svg from './assets/mic.svg';
import speaker_svg from './assets/speaker.svg';
import file_svg from './assets/file.svg'; 
import backgroundPhoto from './assets/bg.jpeg';
import gif from './assets/farm.gif';
import { TransformedItems } from './dropdown';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  transports: ['polling', 'websocket'],
  path: '/socket.io',
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 20000,
});

const App = () => {
  const [text, setText] = useState('');
  const [chatMessage, setChatMessage] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [isListening, setIsListening] = useState(false);
  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);
  const [voices, setVoices] = useState([]);
  const [srError, setSrError] = useState('');
  const localeMap = useMemo(
    () => ({
      en: 'en-US',
      hi: 'hi-IN',
      kn: 'kn-IN',
      te: 'te-IN',
      ml: 'ml-IN',
      ta: 'ta-IN'
    }),
    []
  );
  const supportedRecognitionLocales = useMemo(() => ['en-US', 'hi-IN'], []);
  const srLocale = useMemo(() => {
    const desired = localeMap[selectedLanguage] || 'en-US';
    return supportedRecognitionLocales.includes(desired) ? desired : 'en-US';
  }, [selectedLanguage, localeMap, supportedRecognitionLocales]);

  // Generating transformed dropdown items using useMemo
  const dropdownItems = useMemo(() => TransformedItems(), []);

  // Language options for radio buttons
  const languageOptions = [
    { label: 'English', value: 'en' },
    { label: 'Kannada', value: 'kn' },
    { label: 'Hindi', value: 'hi' },
    { label: 'Telugu', value: 'te' },
    { label: 'Malayalam', value: 'ml' },
    { label: 'Tamil', value: 'ta' }
  ];

  useEffect(() => {
    const load = () => {
      if (window.speechSynthesis) {
        const v = window.speechSynthesis.getVoices();
        if (v && v.length) setVoices(v);
      }
    };
    load();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = load;
    }
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => {}, []);

  // Emitting a message to the server
  const socketEmit = () => {
    let temp = {
      message: text,
      self: true
    };
    setChatMessage((prev) => [...prev, temp]);
    socket.emit('message', {
      message: text,
      language: selectedLanguage
    });
    setText('');
  };

  // Setting up event listeners for receiving messages from the server
  useEffect(() => {
    socket.on('recv_message', (data) => {
      let temp = {
        message: data,
        self: false
      };
      setChatMessage((prev) => [...prev, temp]);
    });

    // Cleanup function to remove the event listener when the component unmounts
    return () => {
      socket.off('recv_message');
    };
  }, []);
  useEffect(() => {
    const onError = () => setSrError('Unable to connect to backend. Retrying...');
    const onConnect = () => setSrError('');
    socket.on('connect_error', onError);
    socket.on('reconnect_error', onError);
    socket.on('reconnect_failed', onError);
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect_error', onError);
      socket.off('reconnect_error', onError);
      socket.off('reconnect_failed', onError);
      socket.off('connect', onConnect);
    };
  }, []);

  // Automatically scrolling to the bottom of the chat window when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessage]);

  // Handling the click event for the microphone button
  const handleMicClick = () => {
    const Rec =
      window.SpeechRecognition || window.webkitSpeechRecognition || null;
    if (!Rec) {
      setIsListening(false);
      setSrError('Speech recognition not supported. Use latest Chrome on desktop.');
      return;
    }
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      setIsListening(false);
      return;
    }
    setSrError('');
    const recognition = new Rec();
    const desiredLocale = localeMap[selectedLanguage] || 'en-US';
    const usingFallback = srLocale !== desiredLocale;
    recognition.lang = srLocale;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognition.onstart = () => {
      setIsListening(true);
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setChatMessage((prev) => [...prev, { message: transcript, self: true }]);
      socket.emit('message', {
        message: transcript,
        language: selectedLanguage
      });
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    recognition.onerror = (e) => {
      setIsListening(false);
      let msg = 'Speech recognition error.';
      if (e && e.error) {
        if (e.error === 'not-allowed') msg = 'Microphone permission denied. Allow mic access.';
        else if (e.error === 'no-speech') msg = 'No speech detected. Try speaking closer to mic.';
        else if (e.error === 'audio-capture') msg = 'No microphone found. Check your input device.';
        else if (e.error === 'aborted') msg = 'Listening stopped.';
        else if (e.error === 'network') msg = 'Network issue with recognition service.';
      }
      if (usingFallback) {
        msg = 'Browser does not support speech recognition for selected language. Using English recognition and translating output.';
      }
      setSrError(msg);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  useEffect(() => {
    return () => {
      try {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      } catch (_) {}
    };
  }, []);

  // Function to speak the last message using text-to-speech
  const speakMessage = () => {
    const lastBotIndex = [...chatMessage]
      .reverse()
      .find((m) => m && m.self === false);
    const lastMessage = lastBotIndex ? lastBotIndex.message : '';
  
    if (!lastMessage) {
      return;
    }
  
    const utterance = new SpeechSynthesisUtterance(lastMessage);
  
    const target = (localeMap[selectedLanguage] || 'en-US').toLowerCase();
    const matchExact =
      voices.find((v) => v.lang && v.lang.toLowerCase() === target) || null;
    const matchLang =
      matchExact ||
      voices.find(
        (v) =>
          v.lang &&
          v.lang.toLowerCase().startsWith(target.slice(0, 2))
      ) ||
      null;
    if (matchLang) {
      utterance.voice = matchLang;
      utterance.lang = matchLang.lang;
    } else {
      utterance.lang = target;
    }
    
    try {
      window.speechSynthesis.speak(utterance);
    } catch (error) {
    } finally {
      setText('');
    }
  };

  // Rendering the main application
  return (
    <div className="App flex flex-col w-full h-screen items-center text-white" style={{ backgroundImage: `url(${backgroundPhoto})`, backgroundSize: 'cover', backgroundRepeat: 'no-repeat' }}>
      <nav className='w-full py-5 flex flex-col items-center z-20'>
        <div className="flex items-center">
          <img className='h-14' src={gif} style={{ width: '130px', height: 'auto' }} />
        </div>

        <div className="flex flex-col items-center font-bebas mt-2 text-lg lg:text-2xl">
          <h2>Farmer Support Chatbot</h2>
        </div>
        <center>
        <div className="flex items-center justify-between  w-full px-4 mt-4">
          <div className="language-selection flex items-center">
            {languageOptions.map((option) => (
              <label key={option.value} className="mx-2">
                <input
                  type="radio"
                  value={option.value}
                  checked={selectedLanguage === option.value}
                  onChange={() => setSelectedLanguage(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
        </center>
      </nav>

      <div id='back-ball' className='absolute rounded-full bg-purple-500/40'></div>
      <div id='back-ball-2' className='absolute rounded-full bg-sky-400/50'></div>
      <div id='backdrop' className='w-screen h-screen fixed z-10'></div>

      <div className="flex flex-col h-3/4 w-4/5 xl:w-2/4 bg-black/40 backdrop-blur-md z-20 rounded-3xl border-2 border-zinc-900/50">
        <div className="heading py-2 px-8 flex items-center border-b-2 border-zinc-500/30">
          <p className='ml-4 text-2xl font-anton'>FarmBot</p>
        </div>

        <div id='chatscreen' className="flex flex-col w-full h-full overflow-auto px-8 py-5">
          <div className="max-w-3/4 py-1 px-3 font-poppins text-lg rounded-3xl bg-slate-600 text-white mr-auto my-2">
            Hey, How may I help you!!
          </div>
          {chatMessage.map((item, key) => (
            <div key={key} id='chatContainer' dangerouslySetInnerHTML={{ __html: item.message }} className={`max-w-3/4 py-1 px-3 font-poppins text-lg rounded-3xl ${item.self ? 'bg-emerald-700' : 'bg-slate-600'} text-white ${item.self ? 'ml-auto' : 'mr-auto'} my-2`}></div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="flex relative w-full justify-center items-center px-4 py-3 border-t-2 border-zinc-500/30">
          {srError ? (
            <div className="absolute -top-10 left-4 right-4 bg-red-600 text-white text-sm px-3 py-2 rounded">
              {srError}
            </div>
          ) : null}
          <div className={`absolute bottom-20 w-full px-5 ${text ? 'block' : 'hidden'}`}>
            <div className='bg-slate-900 max-h-36 overflow-auto px-3 py-2'>
              {dropdownItems.filter(item => item.label.includes(text)).map((itm, key) => (
                <p onClick={() => setText(itm.value)} key={key} className='py-2 border-b-2 border-slate-700/60 cursor-pointer'>{itm.label}</p>
              ))}
            </div>
          </div>

          <input
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                socketEmit();
              }
            }}
            placeholder='Enter message'
            className='rounded-3xl w-full bg-slate-900 py-2 px-5 border-2 border-slate-700/50'
            onChange={(e) => setText(e.target.value)}
            type='text'
            value={text}
          />

          <div className="flex ml-2">
            <button
              className='text-2xl bg-blue-400 py-2 px-2 flex justify-center items-center rounded-full font-bebas ml-2'
              onClick={socketEmit}
            >
              <img className='w-7' src={send_svg} alt='Send' />
            </button>

            <button
              className='text-2xl bg-green-400 py-2 px-2 flex justify-center items-center rounded-full font-bebas ml-2'
              onClick={() => window.open('https://adil200.github.io/Farmer-Schemes/', '_blank')}
            >
              <img className='w-7' src={file_svg} alt='File' />
            </button>

            <button
              className='text-2xl bg-purple-400 py-2 px-2 flex justify-center items-center rounded-full font-bebas ml-2'
              onClick={handleMicClick}
            >
              <img className='w-7' src={isListening ? send_svg : mic_svg} alt='Mic' />
            </button>
          </div>

          <button
            className='text-2xl bg-green-400 py-2 px-2 flex justify-center items-center rounded-full font-bebas ml-2'
            onClick={speakMessage}
          >
            <img className='w-7' src={speaker_svg} alt='Speaker' />
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
