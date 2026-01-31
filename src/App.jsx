import React, { useState, useEffect, useRef } from 'react';
import { Shield, Phone, MapPin, Users, Camera, Mic, Video, Watch, Settings, Home, Lock, Unlock, Battery, Wifi, WifiOff, X, Trash2, Save, Globe } from 'lucide-react';

// ===========================================
// 🟢 CONFIGURATION
// ===========================================
const API_BASE_URL = "https://pratham-backend-9q7v.onrender.com"; 

const BLE_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb'; 
const BLE_CHAR_UUID =    '0000ffe1-0000-1000-8000-00805f9b34fb';

export default function PrathamSuraksha() {
  const [activeTab, setActiveTab] = useState('home');
  const [isLocked, setIsLocked] = useState(true);
  const [tapCount, setTapCount] = useState(0);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState(null);
  
  // 🟢 NEW: State to toggle local saving
  const [saveLocally, setSaveLocally] = useState(true); 

  // Data States
  const [emergencyContacts, setEmergencyContacts] = useState([]); 
  const [location, setLocation] = useState({ lat: 0, lng: 0, accuracy: 0 });
  const [locationName, setLocationName] = useState("Locating...");
  
  // System States
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [lowPowerMode, setLowPowerMode] = useState(false);
  const [wearableConnected, setWearableConnected] = useState(false);
  const [parentalMode, setParentalMode] = useState(false);
  
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
    const handleBeforeInstallPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    const handleAppInstalled = () => { setIsInstalled(true); setDeferredPrompt(null); };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    if (window.matchMedia('(display-mode: standalone)').matches) setIsInstalled(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) { alert("To install: Tap browser menu (⋮) -> 'Add to Home Screen'."); return; }
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
        if (value.includes("SOS")) { handleEmergencyTap(3, true); }
      });
      setWearableConnected(true);
      alert("✅ Watch Connected! Button will trigger SOS.");
      device.addEventListener('gattserverdisconnected', () => setWearableConnected(false));
    } catch (error) { alert("Connection failed. Ensure Bluetooth is on."); }
  };

  // ============================================
  // 3. 🔋 SMART BATTERY & GPS LOGIC (➕ ADDED FALLBACK)
  // ============================================
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/contacts/list`) 
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setEmergencyContacts(data); })
      .catch(err => console.log("Offline: Using empty contact list"));
  }, []);

  useEffect(() => {
    // Helper to get IP Location (Fallback if GPS is off/closed)
    const fetchIPLocation = () => {
        if (!navigator.onLine) return;
        fetch('https://ipapi.co/json/')
            .then(res => res.json())
            .then(data => {
                if (data.latitude && data.longitude) {
                    setLocation({ lat: data.latitude, lng: data.longitude, accuracy: 5000 }); // Low accuracy
                    setLocationName(`${data.city}, ${data.region} (Approx)`);
                    console.log("Using IP Location Fallback");
                }
            })
            .catch(e => console.log("IP Location failed"));
    };

    if ('geolocation' in navigator) {
      const useHighAccuracy = offlineMode || !lowPowerMode || parentalMode;
      const options = { enableHighAccuracy: useHighAccuracy, timeout: 15000, maximumAge: 60000 };

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
        (error) => {
            console.log('GPS Error:', error);
            // 🟢 NEW: If GPS fails or is closed, try IP Location
            fetchIPLocation();
        },
        options
      );
    } else {
        // Fallback for browsers without geo
        fetchIPLocation();
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
    
    if (tapType === 1) { 
        title = "Police Help"; 
        contacts = ["100"]; 
        const mapLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
        window.location.href = `sms:100?body=${encodeURIComponent(`SOS! I need Police Help at ${locationName}. Map: ${mapLink}`)}`;
        return;
    } 
    else if (tapType === 2) { 
        title = "Medical Emergency"; 
        contacts = ["108"];
        const mapLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
        window.location.href = `sms:108?body=${encodeURIComponent(`SOS! I need Ambulance at ${locationName}. Map: ${mapLink}`)}`;
        return;
    } 
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

    if (!isRecording) startAnonymousRecording('video', true);

    // Use current state location immediately in case GPS callback takes time
    const sendAlert = (lat, lng) => {
        const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
        const msgBody = `SOS! ${title} at ${locationName}. Loc: ${lat}, ${lng}. Map: ${mapLink}`;
        const sosData = { type: title, contacts, location: { lat, lng }, message: msgBody, time: new Date().toISOString() };

        if (navigator.onLine && !offlineMode) {
            fetch(`${API_BASE_URL}/api/sos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(sosData),
            }).then(() => { if(!fromWatch) alert(`✅ Alert Sent to Server!`); })
              .catch(() => sendOfflineSMS(contacts, title, mapLink, lat, lng));
        }
        sendOfflineSMS(contacts, title, mapLink, lat, lng);
    };

    // Try to get fresh location, otherwise use state
    navigator.geolocation.getCurrentPosition(
        (pos) => sendAlert(pos.coords.latitude, pos.coords.longitude),
        (err) => sendAlert(location.lat, location.lng), // Fallback to existing state (IP or last known)
        { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  const sendOfflineSMS = (contacts, title, mapLink, lat, lng) => {
    const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? ';' : ',';
    const body = `SOS! ${title}. I am at Lat: ${lat}, Lng: ${lng}. Map: ${mapLink}`;
    window.location.href = `sms:${contacts.join(separator)}?body=${encodeURIComponent(body)}`;
  };

  // ============================================
  // 5. 📹 RECORDING (➕ ADDED LOCAL SAVE TOGGLE CHECK)
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
        
        // 🟢 NEW: Check 'saveLocally' state before downloading
        if (saveLocally) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `SOS_${type}_${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); alert("✅ File Saved Locally!"); }, 100);
        } else {
            console.log("Local save disabled by user.");
        }

        if (navigator.onLine) {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            try {
              await fetch(`${API_BASE_URL}/api/sos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: `Evidence (${type})`,
                  contacts: emergencyContacts.map(c => c.phone),
                  location: location,
                  mediaData: reader.result, 
                  mediaType: type === 'video' ? 'video/webm' : 'audio/webm'
                })
              });
              if(!isAuto && !saveLocally) alert("✅ Uploaded to Cloud (Local Save OFF)");
              else if (!isAuto) alert("✅ Evidence Uploaded to Cloud!");
            } catch (err) { console.log("Upload failed", err); }
          };
        }
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        setRecordingType(null);
      };

      mediaRecorder.start();
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
        fetch(`${API_BASE_URL}/api/contacts/add`, {
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
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      
      {/* 🔵 HEADER */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-800 px-6 py-4 flex items-center gap-3 shadow-lg">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-white flex items-center justify-center p-0.5">
           <img 
             src="/pratham-suraksha-logo.png" 
             alt="Pratham Suraksha Logo" 
             className="w-full h-full object-cover rounded-full"
             onError={(e) => {e.target.style.display='none'}}
           />
           <Shield className="w-8 h-8 text-blue-800 absolute opacity-0" />
        </div>
        <div>
           <h1 className="text-white font-bold text-lg leading-tight">Pratham Suraksha</h1>
           <p className="text-blue-200 text-xs">Your Safety Companion</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-white">
          <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-full"><Battery className={`w-3 h-3 ${batteryLevel < 20 ? 'text-red-300' : ''}`} /><span className="text-[10px] font-bold">{batteryLevel}%</span></div>
          {offlineMode ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 pb-24 space-y-6">
        {activeTab === 'home' && (
          <div className="space-y-6">
            
            {/* 🔴 SOS SECTION */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <h2 className="text-gray-800 font-bold text-sm text-center">EMERGENCY TAP ZONE</h2>
                    <p className="text-gray-600 text-xs text-center mt-0.5">Tap 1x: Police | 2x: Amb | 3x: Parents</p>
                </div>
                <div className="p-8 flex justify-center">
                    <button onClick={handleTap} className="relative group">
                        <div className="absolute inset-0 bg-red-500 rounded-3xl blur-xl opacity-40 group-hover:opacity-60 transition-opacity animate-pulse"></div>
                        <div className="relative bg-gradient-to-br from-red-500 to-red-600 rounded-3xl px-12 py-10 shadow-2xl transform transition-transform active:scale-95 flex flex-col items-center gap-3">
                            <Shield className="w-16 h-16 text-white" />
                            <span className="text-white font-bold text-xl tracking-wide whitespace-nowrap">TAP HERE</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* 🔵 RECORDING SECTION */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5">
                <div className="flex items-center justify-center gap-2 text-gray-700 mb-4">
                     <Camera className="w-5 h-5 text-gray-500" />
                     <span className="font-bold text-sm">Anonymous Recording</span>
                </div>
                <div className="flex items-center justify-center gap-4">
                    <button onClick={() => startAnonymousRecording('audio')} disabled={isRecording} className={`flex flex-col items-center justify-center w-20 h-20 rounded-2xl shadow-lg transition-all ${isRecording ? 'bg-red-600' : 'bg-gradient-to-br from-blue-900 to-blue-800'}`}>
                        <Mic className="w-7 h-7 text-white mb-1" />
                        <span className="text-white text-xs font-medium">Audio</span>
                    </button>
                    <button onClick={() => startAnonymousRecording('image')} disabled={isRecording} className="flex flex-col items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl shadow-lg active:scale-95">
                        <Camera className="w-7 h-7 text-white mb-1" />
                        <span className="text-white text-xs font-medium">Image</span>
                    </button>
                    <button onClick={() => startAnonymousRecording('video')} disabled={isRecording} className="flex flex-col items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl shadow-lg active:scale-95">
                        <Video className="w-7 h-7 text-white mb-1" />
                        <span className="text-white text-xs font-medium">Video</span>
                    </button>
                </div>
            </div>

            {/* LOCATION CARD */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-gray-800"><MapPin className="w-5 h-5 text-green-600" /> Live Location</h3>
                <div className="bg-gray-50 p-4 rounded-xl mb-3 border border-gray-100">
                    <p className="text-lg font-bold text-blue-900">{locationName}</p>
                    <p className="text-sm font-mono mt-1 text-gray-600">Lat: {location.lat.toFixed(5)}, Lng: {location.lng.toFixed(5)}</p>
                </div>
                <button onClick={shareLocation} className="w-full py-3 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-xl font-bold text-sm shadow hover:opacity-90">SHARE LOCATION</button>
            </div>

            {/* WATCH CARD */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-gray-800"><Watch className="w-5 h-5 text-purple-600" /> Wearable</h3>
                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100 mb-3">
                    <span className="text-sm font-medium text-gray-600">Status</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${wearableConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{wearableConnected ? 'CONNECTED' : 'NOT LINKED'}</span>
                </div>
                <button onClick={connectWearable} className="w-full py-3 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-xl font-bold text-sm shadow hover:opacity-90">CONNECT WATCH</button>
            </div>
          </div>
        )}

        {/* CONTACTS TAB */}
        {activeTab === 'contacts' && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
                <h2 className="text-gray-800 font-bold text-sm mb-4 flex items-center gap-2"><Users className="w-4 h-4" /> EMERGENCY CONTACTS</h2>
                {emergencyContacts.length === 0 ? <div className="text-center p-4 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300 mb-3">No contacts.</div> : emergencyContacts.map((c, i) => (<div key={i} className="p-4 bg-gray-50 border border-gray-100 rounded-xl mb-3 flex justify-between items-center"><div><p className="font-semibold text-lg text-gray-800">{c.name}</p><p className="text-sm text-gray-600">{c.phone}</p></div><Phone className="w-6 h-6 text-green-600" /></div>))}
                <button onClick={handleAddContact} className="w-full py-3 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-xl font-bold mt-2">+ Add Contact</button>
                <div className="mt-4 flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                    <span className="font-bold text-sm text-gray-700">Parental Mode</span>
                    <button onClick={() => setParentalMode(!parentalMode)} className={`px-4 py-1.5 rounded-full font-bold text-xs text-white ${parentalMode ? 'bg-green-500' : 'bg-gray-400'}`}>{parentalMode ? "ON" : "OFF"}</button>
                </div>
            </div>
        )}

        {/* 🎨 SETTINGS TAB (UPDATED WITH NEW FEATURE) */}
        {activeTab === 'settings' && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4 space-y-4">
                <h2 className="text-gray-800 font-bold text-sm mb-2 flex items-center gap-2"><Settings className="w-4 h-4" /> SETTINGS</h2>
                
                {/* 1. Save Locally Toggle (NEW) */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-full"><Save className="w-4 h-4 text-blue-600" /></div>
                        <div>
                            <span className="text-sm font-medium text-gray-800 block">Save Recordings Locally</span>
                            <span className="text-[10px] text-gray-500">Save video/audio to gallery</span>
                        </div>
                    </div>
                    <button onClick={() => setSaveLocally(!saveLocally)} className={`px-3 py-1 rounded-full text-xs font-bold text-white ${saveLocally ? 'bg-blue-600' : 'bg-gray-400'}`}>{saveLocally ? 'ON' : 'OFF'}</button>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm font-medium text-gray-700">Screen Lock</span>
                    <button onClick={() => setIsLocked(!isLocked)} className={`px-3 py-1 rounded-full text-xs font-bold text-white ${isLocked ? 'bg-blue-800' : 'bg-gray-400'}`}>{isLocked ? 'ON' : 'OFF'}</button>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm font-medium text-gray-700">Power Saver</span>
                    <button onClick={() => setLowPowerMode(!lowPowerMode)} className={`px-3 py-1 rounded-full text-xs font-bold text-white ${lowPowerMode ? 'bg-orange-500' : 'bg-gray-400'}`}>{lowPowerMode ? 'ON' : 'OFF'}</button>
                </div>
                {!isInstalled && deferredPrompt && <button onClick={handleInstallClick} className="w-full py-3 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-xl font-bold text-sm">Install App</button>}
            </div>
        )}
      </div>

      {/* 🔵 BOTTOM NAVIGATION */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 pb-safe z-50">
        <div className="flex items-center justify-around max-w-md mx-auto">
             <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'home' ? 'text-blue-900' : 'text-gray-400'}`}>
                 <Home className="w-6 h-6" />
                 <span className="text-xs font-medium">Home</span>
             </button>
             <button onClick={() => setActiveTab('contacts')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'contacts' ? 'text-blue-900' : 'text-gray-400'}`}>
                 <Users className="w-6 h-6" />
                 <span className="text-xs font-medium">Contacts</span>
             </button>
             <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'settings' ? 'text-blue-900' : 'text-gray-400'}`}>
                 <Settings className="w-6 h-6" />
                 <span className="text-xs font-medium">Settings</span>
             </button>
        </div>
      </div>

      {!isInstalled && deferredPrompt && activeTab === 'home' && (
        <div className="fixed bottom-20 left-4 right-4 bg-gradient-to-r from-blue-900 to-blue-800 text-white p-4 rounded-xl shadow-2xl flex items-center justify-between z-50 animate-bounce">
            <div><p className="font-bold">Install App</p><p className="text-xs opacity-90">Add to Home Screen</p></div>
            <div className="flex gap-2"><button onClick={() => setDeferredPrompt(null)} className="p-2"><X className="w-5 h-5" /></button><button onClick={handleInstallClick} className="bg-white text-blue-900 px-4 py-2 rounded-lg font-bold text-sm">Install</button></div>
        </div>
      )}
    </div>
  );
}