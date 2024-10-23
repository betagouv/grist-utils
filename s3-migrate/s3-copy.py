import boto3
import logging
import os
import re
import json
import hashlib
import sys
import subprocess
import shlex
from dateutil import parser

logging.basicConfig(stream=sys.stdout, level=logging.INFO)


class Bucket:
    def __init__(self, endpointUrl, accessKey, secretKey, bucket, paginationSize):
        self.client = boto3.client(
            "s3",
            endpoint_url=endpointUrl,
            aws_access_key_id=accessKey,
            aws_secret_access_key=secretKey,
        )
        self.bucket = bucket
        hashBase = "%s-%s" % (endpointUrl, bucket)
        self.tmpMapFile = (
            "/tmp/%s-meta.json" % hashlib.sha256(hashBase.encode("UTF-8")).hexdigest()
        )
        self.paginationSize = paginationSize
        objectPaginator = self.client.get_paginator("list_objects")
        listFiles = []
        for page in objectPaginator.paginate(
            Bucket=self.bucket, PaginationConfig={"PageSize": self.paginationSize}
        ):
            if "Contents" in page.keys():
                for doc in page["Contents"]:
                    listFiles.append(doc["Key"])
        self.documentsList = listFiles

    def getDocumentsList(self):
        return self.documentsList

    def searchMeta(self, file):
        m = re.match(r"docs/(?P<name>.*)\.grist", file)
        logging.info("Recherche du fichier %s/meta.json" % m.group("name"))
        for file in self.getDocumentsList():
            if m.group("name") + "/meta.json" in file:
                for attempt in range(10):
                    try:
                        self.client.download_file(
                            self.bucket,
                            file,
                            self.tmpMapFile,
                        )
                    except Exception as e:
                        logging.error(e)
                    else:
                        break
                else:
                    logging.info(
                        "La récupération du fichier %s sur le bucket %s a échoué"
                        % (file, self.bucket)
                    )
                    return None

                with open(self.tmpMapFile, "r") as f:
                    data = json.load(f)
                    size = len(data)
                if not data:
                    return None
                else:
                    return {
                        "uri": file,
                        "size": size,
                        "lastModified": data[0]["lastModified"],
                    }
        return None

    def getVersionsOfDoc(self, doc):
        versionPaginator = self.client.get_paginator("list_object_versions")
        listVersionOfFiles = []
        for pageVersion in versionPaginator.paginate(
            Bucket=self.bucket,
            Prefix=doc,
            PaginationConfig={"PageSize": self.paginationSize},
        ):
            if "Versions" in pageVersion.keys():
                for version in pageVersion["Versions"]:
                    listVersionOfFiles.append(version)
        listVersionOfFiles.sort(key=lambda item: item["LastModified"], reverse=False)
        return listVersionOfFiles

    def copyVersion(self, srcBucket, file, version, updateMeta):
        filename = "/tmp/%s" % version
        for attempt in range(10):
            try:
                logging.info(
                    "Download du fichier %s depuis la source (%s)" % (file, attempt)
                )
                srcBucket.client.download_file(
                    srcBucket.bucket, file, filename, ExtraArgs={"VersionId": version}
                )
                ## Amaigrissement du fichier source
                subprocess.call(shlex.split("/tmp/clean-history.sh %s" % filename))
                logging.info("Upload du fichier %s sur la cible (%s)" % (file, attempt))
                result = self.client.put_object(
                    Body=open(filename, "rb"), Bucket=self.bucket, Key=file
                )
                if updateMeta:
                    logging.info(
                        "Mise à jour des  données dans %s (%s)"
                        % (srcBucket.tmpMapFile, attempt)
                    )
                    with open(srcBucket.tmpMapFile, "r+") as f:
                        data = json.load(f)
                        for doc in data:
                            if doc["snapshotId"] == version:
                                doc["snapshotId"] = result["VersionId"]
                        f.seek(0)  # <--- should reset file position to the beginning.
                        json.dump(data, f, indent=4)
                        f.truncate()
                os.remove(filename)
                return result
            except Exception as e:
                logging.error(e)
                logging.error(
                    "Une erreur est  survenu pendant  la copie d'un fichier. (%s)"
                    % attempt
                )
            else:
                break
        else:
            logging.error(
                "La copie du fichier %s en version %s a échoué (%s)"
                % (file, version, attempt)
            )
        return None

    def uploadMeta(self, srcBucket, file):
        for attempt in range(10):
            try:
                self.client.put_object(
                    Body=open(srcBucket.tmpMapFile, "rb"), Bucket=self.bucket, Key=file
                )
            except Exception as e:
                logging.error(e)
            else:
                break
        else:
            logging.info(
                "L'upload du fichier %s sur le bucket %s a échoué" % (file, self.bucket)
            )

    def deleteFile(self, file):
        logging.info("Suppression du fichier %s et de ses versions" % file)
        for attempt in range(10):
            try:
                objects = []
                listVersion = self.getVersionsOfDoc(file)
                for v in listVersion:
                    objects.append({"VersionId": v["VersionId"], "Key": v["Key"]})
                if objects:
                    self.client.delete_objects(
                        Bucket=self.bucket, Delete={"Objects": objects}
                    )
                else:
                    logging.info(
                        "Le fichier n'existe pas sur le bucket %s" % self.bucket
                    )
            except Exception as e:
                logging.error(e)
            else:
                break
        else:
            logging.info("La suppression du fichier %s a échoué" % file)

    def deleteSpecificVersion(self, file, src):
        logging.info("Supprime les versions qui ne sont pas dans le %s" % file)
        for attempt in range(10):
            try:
                objects = []
                listVersion = self.getVersionsOfDoc(file)
                with open(src.tmpMapFile, "r") as file1:
                    data1 = json.load(file1)
                listId = {item["snapshotId"] for item in data1}
                for v in listVersion:
                    if v["VersionId"] not in listId:
                        objects.append({"VersionId": v["VersionId"], "Key": v["Key"]})
                if objects:
                    self.client.delete_objects(
                        Bucket=self.bucket, Delete={"Objects": objects}
                    )
                    logging.info("On vient de nettoyer des versions orphelines")
                else:
                    logging.info("Il n'y a rien à nettoyer")
            except Exception as e:
                logging.error(e)
            else:
                break
        else:
            logging.info("La suppression du fichier %s a échoué" % file)


def fixSnapshotId(src, dst):
    with open(src.tmpMapFile, "r") as file1, open(dst.tmpMapFile, "r") as file2:
        data1 = json.load(file1)
        data2 = json.load(file2)
    data2_dict = {item["lastModified"]: item["snapshotId"] for item in data2}

    for item in data1:
        if item["lastModified"] in data2_dict:
            item["snapshotId"] = data2_dict[item["lastModified"]]
    with open(src.tmpMapFile, "w") as output_file:
        json.dump(data1, output_file, indent=4)


src = Bucket(
    os.environ.get("SRC_ENDPOINT_URL", "http://localhost:9000"),
    os.environ.get("SRC_ACCESS_KEY", "changeme"),
    os.environ.get("SRC_SECRET_KEY", "changeme"),
    os.environ.get("SRC_BUCKET_NAME", "test1"),
    os.environ.get("PAGINATION_SIZE", 1000),
)
dst = Bucket(
    os.environ.get("DST_ENDPOINT_URL", "http://localhost:9000"),
    os.environ.get("DST_ACCESS_KEY", "changeme"),
    os.environ.get("DST_SECRET_KEY", "changeme"),
    os.environ.get("DST_BUCKET_NAME", "test1"),
    os.environ.get("PAGINATION_SIZE", 1000),
)

logging.info("Initialisation")
for file in src.getDocumentsList():
    logging.info("Début de la boucle sur la liste des fichiers")
    changeDetected = True
    updateMeta = True
    if "meta.json" not in file:
        srcMeta = src.searchMeta(file)
        dstMeta = dst.searchMeta(file)
        if srcMeta:
            if dstMeta:
                logging.info(
                    "meta.json trouvé sur la  cible, vérification nouvelle version"
                )
                if (
                    srcMeta["size"] == dstMeta["size"]
                    and srcMeta["lastModified"] == dstMeta["lastModified"]
                ):
                    logging.info("Pas de nouvelle version détectée")
                    changeDetected = False
                else:
                    logging.info(
                        "Nouvelle version détecté pour %s, suppression sur la cible"
                        % file
                    )
            if srcMeta is None and dstMeta:
                updateMeta = False
                dst.deleteFile(file)
                dst.deleteFile(dstMeta["uri"])
            if changeDetected:
                versions = src.getVersionsOfDoc(file)
                if dstMeta:
                    for index, version in enumerate(versions):
                        if version["LastModified"] > parser.isoparse(
                            dstMeta["lastModified"]
                        ):
                            print("Copie nouvelles versions")
                            dst.copyVersion(src, file, version["VersionId"], updateMeta)
                else:
                    logging.info("Upload initial")
                    for index, version in enumerate(versions):
                        print("Upload %s" % file)
                        dst.copyVersion(src, file, version["VersionId"], updateMeta)
            # Supprime les versions en trop sur la destination
            logging.info("Upload du fichier meta")
            fixSnapshotId(src, dst)
            dst.deleteSpecificVersion(file, src)
            dst.uploadMeta(src, srcMeta["uri"])
