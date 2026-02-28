import sys
from PyQt5.QtWidgets import QApplication, QMainWindow
from PyQt5.uic import loadUi
import os
from PyQt5.QtWidgets import QFileDialog

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.load_ui()

    def load_ui(self):
        self.ui = loadUi('main.ui')
        self.ui.show()

        # Add the following line to connect the button click event to the build_script function
        self.ui.buildButton.clicked.connect(self.build_script)

    def build_script(self):
        file_name, _ = QFileDialog.getSaveFileName(self, 'Save File', os.path.expanduser("~/Desktop"), 'Python Files (*.py)')
        if file_name:
            with open(file_name, 'w') as f:
                f.write(self.generate_script())

    def generate_script(self):
        return '''
import sys

def main():
    # Insert AI code here

if __name__ == '__main__':
    main()
        '''

def main():
    app = QApplication(sys.argv)
    main_window = MainWindow()
    sys.exit(app.exec_())

if __name__ == '__main__':
    main()
