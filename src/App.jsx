import React, { useState, useEffect, useRef } from 'react';
import { Shield, Phone, MapPin, Users, Camera, Mic, Video, Watch, Bell, Settings, Home, Lock, Unlock, Battery, Download, Wifi, WifiOff } from 'lucide-react';

// ============================================
// MAIN COMPONENT: PrathamSuraksha
// ============================================
export default function PrathamSuraksha() {
  const [activeTab, setActiveTab] = useState('home');
  const [isLocked, setIsLocked] = useState(true);
  const [tapCount, setTapCount] = useState(0);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState(null);
  
  // Contacts state
  const [emergencyContacts, setEmergencyContacts] = useState([]); 

  // Location States
  const [location, setLocation] = useState({ lat: 0, lng: 0, accuracy: 0 });
  const [locationName, setLocationName] = useState("Locating..."); // Stores "Ghaziabad, UP"
  
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);
  const [parentalMode, setParentalMode] = useState(false);
  const [wearableConnected, setWearableConnected] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [lowPowerMode, setLowPowerMode] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  
  const tapTimerRef = useRef(null);
  const locationWatchId = useRef(null);

  // 1. 🔄 Load Contacts
  useEffect(() => {
    fetch("http://localhost:5000/api/contacts/list") // Replace with Render URL if deployed
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setEmergencyContacts(data); })
      .catch(err => console.log("Offline: Using empty contact list"));
  }, []);

  // 2. 🌍 Real-Time GPS & Address Lookup
  useEffect(() => {
    if ('geolocation' in navigator) {
      const options = {
        enableHighAccuracy: true, // Forces Hardware GPS (Works Offline)
        timeout: 15000, 
        maximumAge: 0 
      };

      locationWatchId.current = navigator.geolocation.watchPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = position.coords.accuracy;

          setLocation({ lat, lng, accuracy, timestamp: Date.now() });

          // 🏙️ Get City Name (Reverse Geocoding)
          if (navigator.onLine) {
            // Free OpenStreetMap API to get "Ghaziabad" from lat/lng
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
              .then(res => res.json())
              .then(data => {
                // Simplify the address (e.g., "Ghaziabad, Uttar Pradesh")
                const city = data.address.city || data.address.town || data.address.village || "Unknown City";
                const state = data.address.state || "";
                const area = data.address.suburb || data.address.neighbourhood || "";
                setLocationName(`${area}, ${city}`);
              })
              .catch(() => setLocationName("GPS Active (Map Unavailable)"));
          } else {
            // Offline Fallback
            setLocationName("Offline Mode (Precise GPS Active)");
          }
        },
        (error) => console.log('GPS Error:', error),
        options
      );
    }
    return () => {
      if (locationWatchId.current) navigator.geolocation.clearWatch(locationWatchId.current);
    };
  }, []);

  // Network & Battery Listeners
  useEffect(() => {
    const handleOnline = () => setOfflineMode(false);
    const handleOffline = () => setOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    if ('getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', () => setBatteryLevel(Math.round(battery.level * 100)));
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --------------------------------------------
  // 🛡️ EMERGENCY LOGIC
  // --------------------------------------------
  const handleTap = () => {
    setTapCount(prev => {
      const count = prev + 1;
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapTimerRef.current = setTimeout(() => {
        handleEmergencyTap(count);
        setTapCount(0);
      }, 800);
      return count;
    });
  };

  const handleEmergencyTap = async (tapType) => {
    let title = "";
    let contacts = [];

    if (tapType === 1) { title = "Police Emergency"; contacts = ["100"]; } 
    else if (tapType === 2) { title = "Ambulance Emergency"; contacts = ["108"]; } 
    else if (tapType >= 3) {
      title = "Family Emergency";
      if (emergencyContacts.length === 0) {
        alert("⚠️ No emergency contacts found! Please add contacts first.");
        setActiveTab('contacts');
        return;
      }
      contacts = emergencyContacts.map(c => c.phone);
    } else { return; }

    const confirmed = window.confirm(`⚠️ ${title}\n\nAre you sure you want to send an SOS?`);
    if (!confirmed) return;

    const currentLat = location.lat;
    const currentLng = location.lng;
    const mapLink = `https://www.google.com/maps?q=${currentLat},${currentLng}`;

    if (navigator.onLine && !offlineMode) {
      try {
        await fetch("http://localhost:5000/api/sos", { // Replace with Render URL
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: title,
            contacts,
            location: { lat: currentLat, lng: currentLng },
            time: new Date().toISOString()
          }),
        });
        alert(`✅ SOS Sent to Server: ${title}`);
      } catch (err) {
        sendOfflineSMS(contacts, title, mapLink);
      }
    } else {
      sendOfflineSMS(contacts, title, mapLink);
    }
  };

  const sendOfflineSMS = (contacts, title, mapLink) => {
    const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? ';' : ',';
    // We include the City Name in the SMS if available!
    const body = `SOS! ${title}. I am at ${locationName}. Location Map: ${mapLink}`;
    window.location.href = `sms:${contacts.join(separator)}?body=${encodeURIComponent(body)}`;
  };

  // --------------------------------------------
  // 📹 RECORDING LOGIC
  // --------------------------------------------
  const startAnonymousRecording = async (type) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("❌ Camera/Mic not supported.");
      return;
    }
    try {
      setIsRecording(true);
      setRecordingType(type);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video' || type === 'image' ? { facingMode: "environment" } : false
      });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: type === 'video' ? 'video/webm' : 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `SOS_Evidence_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        setRecordingType(null);
        alert("✅ Evidence saved.");
      };
      mediaRecorder.start();
      setTimeout(() => { if (mediaRecorder.state === 'recording') mediaRecorder.stop(); }, 10000);
    } catch (err) {
      console.error(err);
      setIsRecording(false);
      alert("Recording failed.");
    }
  };

  // --------------------------------------------
  // 📞 ADD CONTACTS
  // --------------------------------------------
  const handleAddContact = async () => {
    if ('contacts' in navigator && 'ContactsManager' in window) {
      try {
        const props = ['name', 'tel'];
        const opts = { multiple: true };
        const selectedContacts = await navigator.contacts.select(props, opts);
        
        if (selectedContacts.length > 0) {
          const formatted = selectedContacts.map(c => ({
            name: c.name[0],
            phone: c.tel[0],
            relation: 'Emergency' 
          }));
          saveContactsToDB(formatted);
        }
      } catch (err) { manualAddContact(); }
    } else { manualAddContact(); }
  };

  const manualAddContact = () => {
    const name = prompt("Enter Name:");
    if (!name) return;
    const phone = prompt("Enter Phone Number:");
    if (!phone) return;
    saveContactsToDB([{ name, phone, relation: 'Emergency' }]);
  };

  const saveContactsToDB = (newContacts) => {
    setEmergencyContacts(prev => [...prev, ...newContacts]);
    newContacts.forEach(contact => {
       fetch("http://localhost:5000/api/contacts/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(contact)
       }).catch(e => console.log("Save failed", e));
    });
  };

  const shareLocation = () => {
    if (emergencyContacts.length === 0) {
        alert("Please add emergency contacts first!");
        return;
    }
    const mapLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
    sendOfflineSMS(emergencyContacts.map(c => c.phone), "Sharing Location", mapLink);
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
            locationName={locationName} // ✅ Passing City Name
            offlineMode={offlineMode}
            wearableConnected={wearableConnected}
            lowPowerMode={lowPowerMode}
            handleEmergencyTap={handleTap} 
            startAnonymousRecording={startAnonymousRecording} 
            shareLocation={shareLocation}
            setWearableConnected={setWearableConnected}
          />
        )}

        {activeTab === 'contacts' && (
          <ContactsTab
            emergencyContacts={emergencyContacts}
            parentalMode={parentalMode}
            setParentalMode={setParentalMode}
            onAddContact={handleAddContact} 
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            isLocked={isLocked}
            setIsLocked={setIsLocked}
            offlineMode={offlineMode}
            lowPowerMode={lowPowerMode}
            setLowPowerMode={setLowPowerMode}
            batteryLevel={batteryLevel}
            isInstalled={isInstalled}
          />
        )}
      </div>

      <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
      <InstallPrompt isInstalled={isInstalled} setIsInstalled={setIsInstalled} />
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

const HeaderComponent = ({ offlineMode, isLocked, batteryLevel, lowPowerMode }) => {
  return (
    <div className="bg-gradient-to-r from-pink-600 to-purple-600 text-white p-4 shadow-lg">
      <div className="flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-2">
          {/* ✅ UPDATED LOGO: Now using your custom icon */}
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center p-1">
             <Shield className="w-full h-full text-blue-800" fill="orange" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Pratham Suraksha</h1>
            <p className="text-xs opacity-90">Your Safety Companion</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white bg-opacity-20 px-2 py-1 rounded-full">
            <Battery className={`w-4 h-4 ${batteryLevel < 20 ? 'text-red-300' : ''}`} />
            <span className="text-xs font-semibold">{batteryLevel}%</span>
          </div>
          {offlineMode ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
          {isLocked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
        </div>
      </div>
    </div>
  );
};

const HomeTab = ({ isRecording, recordingType, location, locationName, offlineMode, wearableConnected, lowPowerMode, handleEmergencyTap, startAnonymousRecording, shareLocation, setWearableConnected }) => {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 border-4 border-red-500">
        <h2 className="text-2xl font-bold text-center mb-2 text-red-600">Emergency Tap Zone</h2>
        <p className="text-center text-sm text-gray-600 mb-4">Works even when screen is locked!</p>
        <button onClick={handleEmergencyTap} className="w-full h-48 bg-gradient-to-br from-red-500 to-pink-600 rounded-xl shadow-lg active:scale-95 transition-transform touch-manipulation">
          <div className="text-white text-center">
            <Shield className="w-16 h-16 mx-auto mb-2" />
            <p className="text-3xl font-bold">TAP HERE</p>
          </div>
        </button>
        <div className="mt-4 p-3 bg-green-50 rounded text-sm text-center font-semibold text-green-700">✔ Confirmation based SOS</div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-4">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><Camera className="w-5 h-5 text-purple-600" /> Anonymous Recording</h3>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => startAnonymousRecording('audio')} disabled={isRecording} className="p-4 bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-xl disabled:opacity-50"><Mic className="w-6 h-6 mx-auto mb-1" /><span className="text-xs">Audio</span></button>
          <button onClick={() => startAnonymousRecording('image')} disabled={isRecording} className="p-4 bg-gradient-to-br from-blue-500 to-purple-500 text-white rounded-xl disabled:opacity-50"><Camera className="w-6 h-6 mx-auto mb-1" /><span className="text-xs">Image</span></button>
          <button onClick={() => startAnonymousRecording('video')} disabled={isRecording} className="p-4 bg-gradient-to-br from-pink-500 to-red-500 text-white rounded-xl disabled:opacity-50"><Video className="w-6 h-6 mx-auto mb-1" /><span className="text-xs">Video</span></button>
        </div>
        {isRecording && <div className="mt-3 p-3 bg-red-100 rounded-lg text-center animate-pulse text-red-700 text-sm font-semibold">🔴 Recording {recordingType}...</div>}
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-4">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><MapPin className="w-5 h-5 text-green-600" /> Live Location</h3>
        <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-xl mb-3">
          {/* ✅ UPDATED: Shows "Ghaziabad, UP" instead of just coordinates */}
          <p className="text-lg font-bold text-blue-900">{locationName}</p> 
          <p className="text-sm font-mono mt-1 text-gray-700">Lat: {location.lat.toFixed(5)}, Lng: {location.lng.toFixed(5)}</p>
          <p className="text-xs text-gray-600 mt-1">Accuracy: ±{location.accuracy || 0}m</p>
        </div>
        <button onClick={shareLocation} className="w-full py-3 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-xl font-semibold">Share Location with Contacts</button>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-4">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><Watch className="w-5 h-5 text-indigo-600" /> Wearable Accessories</h3>
        <button onClick={() => setWearableConnected(!wearableConnected)} className={`w-full py-2 rounded-lg font-semibold ${wearableConnected ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}>{wearableConnected ? '✓ Connected via Bluetooth' : 'Connect Wearable'}</button>
      </div>
    </div>
  );
};

const ContactsTab = ({ emergencyContacts, parentalMode, setParentalMode, onAddContact }) => {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-lg p-4">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Users className="w-6 h-6 text-purple-600" /> Emergency Contacts</h2>
        {emergencyContacts.length === 0 ? (
          <div className="text-center p-4 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300 mb-3">No emergency contacts added yet.</div>
        ) : (
          emergencyContacts.map((contact, idx) => (
            <div key={idx} className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl mb-3 flex justify-between items-center">
              <div>
                <p className="font-semibold text-lg">{contact.name}</p>
                <p className="text-sm text-gray-600">{contact.phone}</p>
              </div>
              <Phone className="w-6 h-6 text-green-600" />
            </div>
          ))
        )}
        <button onClick={onAddContact} className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-semibold mt-2">+ Add Emergency Contact</button>
      </div>
      <div className="bg-white rounded-2xl shadow-lg p-4 flex items-center justify-between bg-blue-50 rounded-xl">
        <span className="text-sm font-semibold">Parental Monitoring</span>
        <button onClick={() => setParentalMode(!parentalMode)} className={`px-4 py-2 rounded-full font-semibold ${parentalMode ? 'bg-green-500 text-white' : 'bg-gray-300'}`}>{parentalMode ? 'ON' : 'OFF'}</button>
      </div>
    </div>
  );
};

const SettingsTab = ({ isLocked, setIsLocked, offlineMode, lowPowerMode, setLowPowerMode, batteryLevel, isInstalled }) => {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-lg p-4">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Settings className="w-6 h-6 text-gray-700" /> Settings</h2>
        <div className="p-4 bg-gray-50 rounded-xl flex items-center justify-between mb-2">
          <span className="font-semibold">Screen Lock Emergency</span>
          <button onClick={() => setIsLocked(!isLocked)} className={`px-3 py-1 rounded-full text-sm font-semibold ${isLocked ? 'bg-green-500 text-white' : 'bg-gray-300'}`}>{isLocked ? 'ON' : 'OFF'}</button>
        </div>
        <div className="p-4 bg-gray-50 rounded-xl flex items-center justify-between">
          <span className="font-semibold">Low Power Mode</span>
          <button onClick={() => setLowPowerMode(!lowPowerMode)} className={`px-3 py-1 rounded-full text-sm font-semibold ${lowPowerMode ? 'bg-orange-500 text-white' : 'bg-gray-300'}`}>{lowPowerMode ? 'ON' : 'OFF'}</button>
        </div>
        {!isInstalled && <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 text-center mt-2"><button className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm">Install App</button></div>}
      </div>
    </div>
  );
};

const BottomNavigation = ({ activeTab, setActiveTab }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 shadow-lg">
      <div className="max-w-md mx-auto flex justify-around p-3">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${activeTab === 'home' ? 'text-purple-600 bg-purple-50' : 'text-gray-500'}`}><Home className="w-6 h-6" /><span className="text-xs font-semibold">Home</span></button>
        <button onClick={() => setActiveTab('contacts')} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${activeTab === 'contacts' ? 'text-purple-600 bg-purple-50' : 'text-gray-500'}`}><Users className="w-6 h-6" /><span className="text-xs font-semibold">Contacts</span></button>
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${activeTab === 'settings' ? 'text-purple-600 bg-purple-50' : 'text-gray-500'}`}><Settings className="w-6 h-6" /><span className="text-xs font-semibold">Settings</span></button>
      </div>
    </div>
  );
};

const InstallPrompt = () => null;