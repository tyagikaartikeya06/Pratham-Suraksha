import React, { useState, useEffect, useRef } from 'react';
import { Shield, Phone, MapPin, Users, Camera, Mic, Video, Watch, Settings, Home, Lock, Unlock, Battery, Wifi, WifiOff, X } from 'lucide-react';

// BLE UUIDs for your Watch
const BLE_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb'; 
const BLE_CHAR_UUID =    '0000ffe1-0000-1000-8000-00805f9b34fb';

export default function PrathamSuraksha() {
  const [activeTab, setActiveTab] = useState('home');
  const [isLocked, setIsLocked] = useState(true);
  const [tapCount, setTapCount] = useState(0);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState(null);
  
  // Data States
  const [emergencyContacts, setEmergencyContacts] = useState([]); 
  const [location, setLocation] = useState({ lat: 0, lng: 0, accuracy: 0 });
  const [locationName, setLocationName] = useState("Locating...");
  
  // System States
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [lowPowerMode, setLowPowerMode] = useState(false);
  const [wearableConnected, setWearableConnected] = useState(false);
  const [parentalMode, setParentalMode] = useState(false); // 🟢 Parental Control State
  
  // Install State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  
  const tapTimerRef = useRef(null);
  const locationWatchId = useRef(null);
  const bluetoothDeviceRef = useRef(null);

  // ============================================
  // 1. 📲 INSTALLATION LOGIC
  // ============================================
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e); 
    };
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    if (window.matchMedia('(display-mode: standalone)').matches) setIsInstalled(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert("To install: Tap browser menu (⋮) -> 'Add to Home Screen'.");
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  // ============================================
  // 2. ⌚ BLUETOOTH WATCH CONNECTION
  // ============================================
  const connectWearable = async () => {
    if (!navigator.bluetooth) return alert("Bluetooth not supported in this browser.");
    try {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [BLE_SERVICE_UUID] }] });
      bluetoothDeviceRef.current = device;
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(BLE_CHAR_UUID);
      await characteristic.startNotifications();
      
      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const value = new TextDecoder().decode(event.target.value);
        if (value.includes("SOS")) {
            // Watch Button Pressed! -> Trigger Family SOS (Type 3)
            handleEmergencyTap(3, true); 
        }
      });
      setWearableConnected(true);
      alert("✅ Watch Connected! Button will trigger SOS.");
      device.addEventListener('gattserverdisconnected', () => setWearableConnected(false));
    } catch (error) { alert("Connection failed. Ensure Bluetooth is on."); }
  };

  // ============================================
  // 3. 🔋 SMART BATTERY & GPS LOGIC
  // ============================================
  useEffect(() => {
    fetch("http://localhost:5000/api/contacts/list") 
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setEmergencyContacts(data); })
      .catch(err => console.log("Offline: Using empty contact list"));
  }, []);

  useEffect(() => {
    if ('geolocation' in navigator) {
      // 🔋 BATTERY SAVER: High Accuracy ONLY when SOS/Parental Mode is active
      const useHighAccuracy = offlineMode || !lowPowerMode || parentalMode;
      const options = { enableHighAccuracy: useHighAccuracy, timeout: 30000, maximumAge: 60000 };

      locationWatchId.current = navigator.geolocation.watchPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = position.coords.accuracy;
          setLocation({ lat, lng, accuracy, timestamp: Date.now() });

          if (navigator.onLine) {
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
              .then(res => res.json())
              .then(data => {
                const city = data.address.city || data.address.town || "Unknown Area";
                const area = data.address.suburb || "";
                setLocationName(`${area}, ${city}`);
              })
              .catch(() => setLocationName("GPS Active"));
          } else {
            setLocationName(`OFFLINE: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
          }
        },
        (error) => console.log('GPS Error:', error),
        options
      );
    }
    return () => { if (locationWatchId.current) navigator.geolocation.clearWatch(locationWatchId.current); };
  }, [offlineMode, lowPowerMode, parentalMode]);

  // ============================================
  // 4. 🛡️ SOS TAP LOGIC
  // ============================================
  const handleTap = () => {
    setTapCount(prev => {
      const count = prev + 1;
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapTimerRef.current = setTimeout(() => { handleEmergencyTap(count, false); setTapCount(0); }, 800);
      return count;
    });
  };

  const handleEmergencyTap = async (tapType, fromWatch = false) => {
    let title = "";
    let contacts = [];
    
    // --- 1 TAP: POLICE SMS ---
    if (tapType === 1) { 
        title = "Police Help"; 
        contacts = ["100"]; // SMS to 100 might fail on some networks, serves as placeholder
        // Open native SMS app for Police
        const mapLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
        window.location.href = `sms:100?body=${encodeURIComponent(`SOS! I need Police Help at ${locationName}. Map: ${mapLink}`)}`;
        return;
    } 
    // --- 2 TAPS: AMBULANCE SMS ---
    else if (tapType === 2) { 
        title = "Medical Emergency"; 
        contacts = ["108"];
        const mapLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
        window.location.href = `sms:108?body=${encodeURIComponent(`SOS! I need Ambulance at ${locationName}. Map: ${mapLink}`)}`;
        return;
    } 
    // --- 3 TAPS (or Watch): FAMILY SOS + RECORDING ---
    else if (tapType >= 3) {
      title = "Family Emergency";
      if (emergencyContacts.length === 0) {
        if (!fromWatch) alert("⚠️ Add contacts first!");
        setActiveTab('contacts');
        return;
      }
      contacts = emergencyContacts.map(c => c.phone);
    } else { return; }

    if (!fromWatch && !window.confirm(`⚠️ ${title}\n\nSend SOS to Parents & Start Recording?`)) return;

    // 🎥 AUTO-RECORD VIDEO (Background Evidence)
    if (!isRecording) startAnonymousRecording('video', true);

    // 📡 FORCE HIGH ACCURACY GPS NOW
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const preciseLat = pos.coords.latitude;
      const preciseLng = pos.coords.longitude;
      const mapLink = `https://www.google.com/maps?q=${preciseLat},${preciseLng}`;
      const msgBody = `SOS! ${title} at ${locationName}. Loc: ${preciseLat}, ${preciseLng}. Map: ${mapLink}`;

      const sosData = { 
        type: title, 
        contacts, 
        location: { lat: preciseLat, lng: preciseLng }, 
        message: msgBody,
        time: new Date().toISOString() 
      };

      // 1. Send to Backend (MongoDB)
      if (navigator.onLine && !offlineMode) {
        try {
          await fetch("http://localhost:5000/api/sos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sosData),
          });
          if(!fromWatch) alert(`✅ Alert Sent to Server!`);
        } catch (err) { sendOfflineSMS(contacts, title, mapLink, preciseLat, preciseLng); }
      } 
      
      // 2. ALWAYS Send Offline SMS (Native App) as fallback/primary
      sendOfflineSMS(contacts, title, mapLink, preciseLat, preciseLng);
      
    }, (err) => {
        const mapLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
        sendOfflineSMS(contacts, title, mapLink, location.lat, location.lng);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  };

  const sendOfflineSMS = (contacts, title, mapLink, lat, lng) => {
    const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? ';' : ',';
    const body = `SOS! ${title}. I am at Lat: ${lat}, Lng: ${lng}. Map: ${mapLink}`;
    window.location.href = `sms:${contacts.join(separator)}?body=${encodeURIComponent(body)}`;
  };

  // ============================================
  // 5. 📹 RECORDING (LOCAL + MONGODB)
  // ============================================
  const startAnonymousRecording = async (type, isAuto = false) => {
    if (!navigator.mediaDevices) { if(!isAuto) alert("Hardware not supported."); return; }
    try {
      setIsRecording(true);
      setRecordingType(type);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type !== 'audio' });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks = [];
      
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: type === 'video' ? 'video/webm' : 'audio/webm' });
        
        // 1. Save Locally (Offline Support)
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SOS_${type}_${Date.now()}.webm`;
        a.click();

        // 2. Upload to MongoDB (Online Support)
        if (navigator.onLine) {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            try {
              await fetch("http://localhost:5000/api/sos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: `Evidence (${type})`,
                  contacts: emergencyContacts.map(c => c.phone),
                  location: location,
                  mediaData: reader.result, // Base64 Video
                  mediaType: type === 'video' ? 'video/webm' : 'audio/webm'
                })
              });
              if(!isAuto) alert("✅ Evidence Uploaded to Cloud!");
            } catch (err) { console.log("Upload failed", err); }
          };
        }
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        setRecordingType(null);
      };

      mediaRecorder.start();
      // Auto-stop after 30s to keep file size manageable for auto-upload
      setTimeout(() => { if (mediaRecorder.state === 'recording') mediaRecorder.stop(); }, 30000); 

    } catch (err) { setIsRecording(false); }
  };

  // ============================================
  // 6. 📞 CONTACTS
  // ============================================
  const handleAddContact = async () => {
    if ('contacts' in navigator && 'ContactsManager' in window) {
      try {
        const selected = await navigator.contacts.select(['name', 'tel'], { multiple: true });
        const formatted = selected.map(c => ({ name: c.name[0], phone: c.tel[0], relation: 'Emergency' }));
        saveContactsToDB(formatted);
      } catch (err) { manualAddContact(); }
    } else { manualAddContact(); }
  };

  const manualAddContact = () => {
    const name = prompt("Name:");
    if (name) {
       const phone = prompt("Phone:");
       if (phone) saveContactsToDB([{ name, phone, relation: 'Emergency' }]);
    }
  };

  const saveContactsToDB = (newContacts) => {
    setEmergencyContacts(prev => [...prev, ...newContacts]);
    newContacts.forEach(c => {
        fetch("http://localhost:5000/api/contacts/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(c)
        }).catch(e => console.log(e));
    });
  };

  const shareLocation = () => {
    if (emergencyContacts.length === 0) return alert("Add contacts first!");
    const mapLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
    sendOfflineSMS(emergencyContacts.map(c => c.phone), "Location Share", mapLink, location.lat, location.lng);
  };

  // ============================================
  // RENDER UI
  // ============================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50">
      <HeaderComponent offlineMode={offlineMode} isLocked={isLocked} batteryLevel={batteryLevel} lowPowerMode={lowPowerMode} />
      <div className="max-w-md mx-auto p-4 pb-24">
        {activeTab === 'home' && (
          <HomeTab
            isRecording={isRecording}
            recordingType={recordingType}
            location={location} 
            locationName={locationName} 
            offlineMode={offlineMode}
            connectWearable={connectWearable} 
            wearableConnected={wearableConnected} 
            lowPowerMode={lowPowerMode}
            handleEmergencyTap={handleTap} 
            startAnonymousRecording={startAnonymousRecording} 
            shareLocation={shareLocation}
          />
        )}
        {activeTab === 'contacts' && <ContactsTab emergencyContacts={emergencyContacts} onAddContact={handleAddContact} parentalMode={parentalMode} setParentalMode={setParentalMode} />}
        {activeTab === 'settings' && <SettingsTab isLocked={isLocked} setIsLocked={setIsLocked} offlineMode={offlineMode} lowPowerMode={lowPowerMode} setLowPowerMode={setLowPowerMode} batteryLevel={batteryLevel} isInstalled={isInstalled} onInstallClick={handleInstallClick} deferredPrompt={deferredPrompt} />}
      </div>
      <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
      
      {!isInstalled && deferredPrompt && activeTab === 'home' && (
        <div className="fixed bottom-20 left-4 right-4 bg-blue-600 text-white p-4 rounded-xl shadow-2xl flex items-center justify-between z-50 animate-bounce">
            <div><p className="font-bold">Install App</p><p className="text-xs opacity-90">Add to Home Screen</p></div>
            <div className="flex gap-2"><button onClick={() => setDeferredPrompt(null)} className="p-2"><X className="w-5 h-5" /></button><button onClick={handleInstallClick} className="bg-white text-blue-600 px-4 py-2 rounded-lg font-bold text-sm">Install</button></div>
        </div>
      )}
    </div>
  );
}

// ============================================
// UI COMPONENTS
// ============================================
const HeaderComponent = ({ offlineMode, isLocked, batteryLevel, lowPowerMode }) => (
    <div className="bg-gradient-to-r from-pink-600 to-purple-600 text-white p-4 shadow-lg">
      <div className="flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center p-1"><Shield className="w-full h-full text-blue-800" fill="orange" /></div>
          <div><h1 className="text-xl font-bold">Pratham Suraksha</h1><p className="text-xs opacity-90">Your Safety Companion</p></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white bg-opacity-20 px-2 py-1 rounded-full"><Battery className={`w-4 h-4 ${batteryLevel < 20 ? 'text-red-300' : ''}`} /><span className="text-xs font-semibold">{batteryLevel}%</span></div>
          {offlineMode ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
          {isLocked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
        </div>
      </div>
    </div>
);
const HomeTab = ({ isRecording, recordingType, location, locationName, offlineMode, connectWearable, wearableConnected, lowPowerMode, handleEmergencyTap, startAnonymousRecording, shareLocation }) => (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 border-4 border-red-500">
        <h2 className="text-2xl font-bold text-center mb-2 text-red-600">Emergency Tap Zone</h2>
        <p className="text-center text-sm text-gray-600 mb-4">Tap 1x: Police | 2x: Amb | 3x: Parents</p>
        <button onClick={handleEmergencyTap} className="w-full h-48 bg-gradient-to-br from-red-500 to-pink-600 rounded-xl shadow-lg active:scale-95 transition-transform touch-manipulation"><div className="text-white text-center"><Shield className="w-16 h-16 mx-auto mb-2" /><p className="text-3xl font-bold">TAP HERE</p></div></button>
      </div>
      <div className="bg-white rounded-2xl shadow-lg p-4">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><Camera className="w-5 h-5 text-purple-600" /> Anonymous Recording</h3>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => startAnonymousRecording('audio')} disabled={isRecording} className="p-4 bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-xl disabled:opacity-50"><Mic className="w-6 h-6 mx-auto mb-1" /><span className="text-xs">Audio</span></button>
          <button onClick={() => startAnonymousRecording('image')} disabled={isRecording} className="p-4 bg-gradient-to-br from-blue-500 to-purple-500 text-white rounded-xl disabled:opacity-50"><Camera className="w-6 h-6 mx-auto mb-1" /><span className="text-xs">Image</span></button>
          <button onClick={() => startAnonymousRecording('video')} disabled={isRecording} className="p-4 bg-gradient-to-br from-pink-500 to-red-500 text-white rounded-xl disabled:opacity-50"><Video className="w-6 h-6 mx-auto mb-1" /><span className="text-xs">Video</span></button>
        </div>
        {isRecording && <div className="mt-3 p-3 bg-red-100 rounded-lg text-center animate-pulse text-red-700 text-sm font-semibold">🔴 Recording {recordingType} (Auto-Upload)...</div>}
      </div>
      <div className="bg-white rounded-2xl shadow-lg p-4">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><MapPin className="w-5 h-5 text-green-600" /> Live Location</h3>
        <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-xl mb-3"><p className="text-lg font-bold text-blue-900">{locationName}</p><p className="text-sm font-mono mt-1 text-gray-700">Lat: {location.lat.toFixed(5)}, Lng: {location.lng.toFixed(5)}</p></div>
        <button onClick={shareLocation} className="w-full py-3 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-xl font-semibold">Share Location</button>
      </div>
      <div className="bg-white rounded-2xl shadow-lg p-4">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><Watch className="w-5 h-5 text-indigo-600" /> Wearable</h3>
        <button onClick={connectWearable} className={`w-full py-2 rounded-lg font-semibold ${wearableConnected ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}>{wearableConnected ? '✓ Connected' : 'Connect Bluetooth Watch'}</button>
      </div>
    </div>
);
const ContactsTab = ({ emergencyContacts, onAddContact, parentalMode, setParentalMode }) => (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-lg p-4">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Users className="w-6 h-6 text-purple-600" /> Emergency Contacts</h2>
        {emergencyContacts.length === 0 ? <div className="text-center p-4 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300 mb-3">No contacts.</div> : emergencyContacts.map((c, i) => (<div key={i} className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl mb-3 flex justify-between items-center"><div><p className="font-semibold text-lg">{c.name}</p><p className="text-sm text-gray-600">{c.phone}</p></div><Phone className="w-6 h-6 text-green-600" /></div>))}
        <button onClick={onAddContact} className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-semibold mt-2">+ Add Contact</button>
      </div>
      <div className="bg-white rounded-2xl shadow-lg p-4 flex justify-between items-center">
          <span className="font-bold">Parental Mode</span>
          <button onClick={() => setParentalMode(!parentalMode)} className={`px-4 py-2 rounded-full font-bold text-white ${parentalMode ? 'bg-green-500' : 'bg-gray-400'}`}>{parentalMode ? "ON" : "OFF"}</button>
      </div>
    </div>
);
const SettingsTab = ({ isLocked, setIsLocked, offlineMode, lowPowerMode, setLowPowerMode, batteryLevel, isInstalled, onInstallClick, deferredPrompt }) => (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-lg p-4">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Settings className="w-6 h-6 text-gray-700" /> Settings</h2>
        <div className="p-4 bg-gray-50 rounded-xl flex items-center justify-between mb-2"><span className="font-semibold">Screen Lock Emergency</span><button onClick={() => setIsLocked(!isLocked)} className={`px-3 py-1 rounded-full text-sm font-semibold ${isLocked ? 'bg-green-500 text-white' : 'bg-gray-300'}`}>{isLocked ? 'ON' : 'OFF'}</button></div>
        <div className="p-4 bg-gray-50 rounded-xl flex items-center justify-between"><span className="font-semibold">Low Power Mode</span><button onClick={() => setLowPowerMode(!lowPowerMode)} className={`px-3 py-1 rounded-full text-sm font-semibold ${lowPowerMode ? 'bg-orange-500 text-white' : 'bg-gray-300'}`}>{lowPowerMode ? 'ON' : 'OFF'}</button></div>
        <div className="mt-4">{!isInstalled && deferredPrompt ? <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 text-center"><p className="text-sm font-semibold text-blue-800">Install Pratham Suraksha App</p><button onClick={onInstallClick} className="mt-2 w-full py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm">Install App</button></div> : <div className="p-4 bg-green-50 rounded-xl border border-green-200 text-center text-green-700 font-semibold">✓ App Installed</div>}</div>
      </div>
    </div>
);
const BottomNavigation = ({ activeTab, setActiveTab }) => (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 shadow-lg"><div className="max-w-md mx-auto flex justify-around p-3">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${activeTab === 'home' ? 'text-purple-600 bg-purple-50' : 'text-gray-500'}`}><Home className="w-6 h-6" /><span className="text-xs font-semibold">Home</span></button>
        <button onClick={() => setActiveTab('contacts')} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${activeTab === 'contacts' ? 'text-purple-600 bg-purple-50' : 'text-gray-500'}`}><Users className="w-6 h-6" /><span className="text-xs font-semibold">Contacts</span></button>
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${activeTab === 'settings' ? 'text-purple-600 bg-purple-50' : 'text-gray-500'}`}><Settings className="w-6 h-6" /><span className="text-xs font-semibold">Settings</span></button>
    </div></div>
);