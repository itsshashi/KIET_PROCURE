const video = document.getElementById('video');
const statusText = document.getElementById('status');

// Helper to correctly extract distance since Face Recognition needs to compare arrays
export function calculateDistance(a, b) {
  return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0));
}

// Ensure the browser loads models via HTTP request instead of the hard drive
async function loadModels() {
  // Models will be served from /models by Express statically
  const MODEL_URL = '/models'; 
  
  statusText.innerText = "Loading models... Please wait.";
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
  ]);
  
  statusText.innerText = "Models loaded. Starting webcam...";
  startVideo();
}

function startVideo() {
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream;
      statusText.innerText = "Webcam active!";
    })
    .catch(err => {
      console.error(err);
      statusText.innerText = "Error accessing webcam.";
    });
}

// When video starts playing, we can run inference
video.addEventListener('play', () => {
  // Setup logic for comparing faces from the video stream...
  console.log("Playing...");
});

// Initialize on page load
loadModels();
