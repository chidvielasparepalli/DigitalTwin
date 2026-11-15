import cv2
import sys

class VideoCaptureModule:
    def __init__(self, camera_index=0, width=1280, height=720):
        """
        Initializes the video capture module.

        Args:
            camera_index (int): Index of the camera to use (0 for default).
            width (int): Desired frame width.
            height (int): Desired frame height.
        """
        self.camera_index = camera_index
        self.width = width
        self.height = height
        self.cap = None

    def start(self):
        """
        Starts the video capture stream.
        """
        self.cap = cv2.VideoCapture(self.camera_index)
        if not self.cap.isOpened():
            print(f"Error: Could not open camera {self.camera_index}", file=sys.stderr)
            sys.exit(1)

        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)

        # Check for CUDA support (OpenCV must be built with CUDA for this to work effectively)
        # cv2.cuda.getCudaEnabledDeviceCount() will return > 0 if CUDA is enabled.
        # However, setting individual capture properties for CUDA is not direct.
        # OpenCV functions that are GPU-accelerated will automatically use CUDA if built with it.
        print(f"OpenCV CUDA support: {cv2.cuda.getCudaEnabledDeviceCount() > 0}")

        print(f"Camera opened: {self.cap.isOpened()}")
        print(f"Frame width: {self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)}")
        print(f"Frame height: {self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)}")

    def read_frame(self):
        """
        Reads a single frame from the camera.

        Returns:
            numpy.ndarray: The captured frame, or None if no frame is available.
        """
        ret, frame = self.cap.read()
        if not ret:
            print("Error: Failed to read frame.", file=sys.stderr)
            return None
        return frame

    def release(self):
        """
        Releases the camera resources.
        """
        if self.cap:
            self.cap.release()
            print("Camera released.")

    def run_display_test(self):
        """
        Runs a test loop to display video feed.
        """
        self.start()
        try:
            while True:
                frame = self.read_frame()
                if frame is None:
                    break

                # Display the frame
                cv2.imshow('Video Feed', frame)

                # Press 'q' to exit
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
        finally:
            self.release()
            cv2.destroyAllWindows()

if __name__ == "__main__":
    # Create a directory for video source files
    # This is handled by a previous step (Bash mkdir -p src/video)

    # To run this script:
    # 1. Ensure OpenCV is installed with CUDA support if available.
    #    pip install opencv-python opencv-contrib-python
    #    (Note: For CUDA support, typically you need to compile OpenCV from source or use pre-built wheels like `opencv-python-headless-cuda`)
    # 2. Run from your terminal: python src/video/video_capture.py

    capture_module = VideoCaptureModule()
    capture_module.run_display_test()
