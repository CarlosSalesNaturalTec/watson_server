FROM icr.io/codeengine/node:16
RUN npm install
COPY index.js .
COPY /audio /audio
COPY /uploads /uploads
EXPOSE 8080
CMD [ "node", "index.js" ]
