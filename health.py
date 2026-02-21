import pymongo
import http.server
import socketserver
import os

def check_db():
    try:
        username = os.getenv('MONGO_INITDB_ROOT_USERNAME')
        password = os.getenv('MONGO_INITDB_ROOT_PASSWORD')
        client = pymongo.MongoClient('localhost', 27017, username=username, password=password)
        db = client.admin
        result = db.command('ping')
        return result.get('ok') == 1.0
    except:
        return False

class HealthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            if check_db():
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'OK')
            else:
                self.send_response(503)
                self.end_headers()
                self.wfile.write(b'NOT OK')
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    with socketserver.TCPServer(("", 8080), HealthHandler) as httpd:
        httpd.serve_forever()